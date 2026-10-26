'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { toast } from 'sonner';
import { api, ApiError, NetworkError } from '@/lib/api-client';
import { networkToast, toastForError } from '@/lib/toasts';
import { DIRECT_EDIT_DEBOUNCE_MS, UNDO_TOAST_MS } from '@/shared/constants';
import { uiText } from '@/shared/messages/ui-copy';
import type { PlanDto } from '@/shared/schemas/api/plans';
import { setActivePlan } from './plan-cache';
import {
  initEditor,
  patchPayload,
  planEditorReducer,
  type EditorAction,
  type EditorState,
} from './plan-editor-reducer';

type Payload = ReturnType<typeof patchPayload>;

/**
 * UF-8 persistence (plan-direct-edits.md §4): 600 ms debounce, one PATCH in flight, `flush()` before
 * text edit / accept / reset, Undo for deletes (the deletion is sent only once committed).
 */
export function useDirectEdits(initial: PlanDto, onExpired: () => void) {
  const qc = useQueryClient();
  const [state, dispatch] = useReducer(planEditorReducer, initial, initEditor);
  const stateRef = useRef<EditorState>(state);
  const changeSeq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const retry = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const replace = useCallback(
    (plan: PlanDto) => {
      changeSeq.current += 1;
      if (timer.current) clearTimeout(timer.current);
      dispatch({ type: 'server_replace', plan });
      stateRef.current = initEditor(plan);
      setActivePlan(qc, plan);
    },
    [qc],
  );

  const refetch = useCallback(async () => {
    const { plan } = await api<{ plan: PlanDto }>('GET', `/api/v1/plans/${stateRef.current.plan.id}`);
    if (plan.status === 'draft' || plan.status === 'accepted') replace(plan);
    else {
      setActivePlan(qc, null);
      await qc.invalidateQueries({ queryKey: ['planner'] });
    }
  }, [qc, replace]);

  const send = useCallback(
    (payload?: Payload): Promise<void> => {
      if (inflight.current) {
        again.current = true;
        return inflight.current;
      }
      const body = payload ?? patchPayload(stateRef.current);
      const seqAtSend = changeSeq.current;
      const run = (async () => {
        try {
          const { plan } = await api<{ plan: PlanDto }>('PATCH', `/api/v1/plans/${stateRef.current.plan.id}`, body);
          if (changeSeq.current === seqAtSend && !stateRef.current.pendingDelete) {
            dispatch({ type: 'server_replace', plan });
            stateRef.current = initEditor(plan);
          } else {
            dispatch({ type: 'adopt_version', version: plan.version, expiresAt: plan.expires_at });
            stateRef.current = { ...stateRef.current, plan: { ...stateRef.current.plan, version: plan.version } };
            again.current = true;
          }
          setActivePlan(qc, plan);
        } catch (err) {
          if (err instanceof NetworkError) networkToast(() => void retry.current());
          else if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
            await refetch();
            toast(uiText('plan.versionConflict'));
          } else if (err instanceof ApiError && err.code === 'PLAN_EXPIRED') onExpired();
          else if (err instanceof ApiError && err.code === 'PLAN_NOT_EDITABLE') await refetch();
          else toastForError(err);
        } finally {
          inflight.current = null;
        }
      })();
      inflight.current = run;
      return run.then(() => {
        if (again.current) {
          again.current = false;
          return retry.current();
        }
      });
    },
    [qc, refetch, onExpired],
  );

  useEffect(() => {
    retry.current = () => send();
  }, [send]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void send();
    }, DIRECT_EDIT_DEBOUNCE_MS);
  }, [send]);

  const act = useCallback(
    (action: EditorAction) => {
      changeSeq.current += 1;
      dispatch(action);
      schedule();
    },
    [schedule],
  );

  /** Delete with a 5 s Undo toast; the PATCH carries the deletion only after the toast closes. */
  const remove = useCallback(
    (itemId: string, name: string) => {
      changeSeq.current += 1;
      dispatch({ type: 'delete', itemId, now: Date.now() });
      toast(uiText('plan.removedToast', { name }), {
        duration: UNDO_TOAST_MS,
        action: {
          label: uiText('plan.undo'),
          onClick: () => {
            changeSeq.current += 1;
            dispatch({ type: 'undo_delete' });
          },
        },
        onAutoClose: () => {
          changeSeq.current += 1;
          dispatch({ type: 'commit_delete' });
          schedule();
        },
      });
    },
    [schedule],
  );

  /** Commits a pending delete, cancels the debounce and awaits the PATCH (before API-11/12/13). */
  const flush = useCallback(async (): Promise<void> => {
    const s = stateRef.current;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inflight.current) await inflight.current;
    const pending = stateRef.current.pendingDelete;
    if (pending) {
      toast.dismiss();
      dispatch({ type: 'commit_delete' });
      stateRef.current = { ...stateRef.current, pendingDelete: null, dirty: true };
    }
    if (!s.dirty && !pending) return;
    await send(patchPayload({ ...stateRef.current, pendingDelete: null }));
  }, [send]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** The latest version, readable right after an awaited flush (before React re-renders). */
  const currentVersion = useCallback(() => stateRef.current.plan.version, []);

  return { state, act, remove, flush, replace, currentVersion };
}
