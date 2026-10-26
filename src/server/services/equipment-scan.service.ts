import 'server-only';
import { PHOTO_CONFIDENCE_THRESHOLD } from '@/server/agents/agent-config';
import { equipmentVisionAgent } from '@/server/agents/equipment-vision/equipment-vision.agent';
import { dbLogSink, runAgent } from '@/server/agents/run-agent';
import { SCAN_DEADLINE_MS } from '@/server/config/app-config';
import { withUserTx, type JwtClaims } from '@/server/db/with-user-tx';
import * as equipmentRepo from '@/server/db/repositories/equipment.repo';
import * as eventRepo from '@/server/db/repositories/event.repo';
import type { ProfileRow } from '@/server/db/repositories/profile.repo';
import * as usageRepo from '@/server/db/repositories/usage.repo';
import { filterDetections, proposeSelection, scanStatus } from '@/server/domain/equipment/photo-detections';
import { assertCanScan, localUsageDate, scansRemaining } from '@/server/domain/limits/limits-policy';
import { createDeadline } from '@/server/http/deadline';
import { AppError } from '@/server/http/errors';
import { assertNoOtherInflight } from '@/server/http/idempotency';
import type { ImageMediaType } from '@/lib/security/image-upload';
import type { ScanResponse } from '@/shared/schemas/api/equipment-scan';
import { getReference } from './reference-data.service';
import { assertUnderBudget } from './spend-guard.service';

type Claims = JwtClaims & { sub: string };
export type ScanPhoto = { bytes: Uint8Array; mediaType: ImageMediaType; width: number; height: number };

// AG-1 returned something usable; these outcomes count against the daily limit (D-12, PRD §8.11).
const COUNTED = new Set(['ok', 'schema_invalid', 'max_tokens']);

/**
 * API-06 (equipment-photo-scan.md §3). D-01: photos stay in memory for this call only — they are never
 * written to Storage, disk, the database or logs (agent_logs gets byte/size stubs).
 */
export async function scan(
  a: { claims: Claims; profile: ProfileRow | null; requestId: string; idempotencyKey: string; now: Date },
  body: { context: 'onboarding' | 'profile_edit'; timezone: string; photos: ScanPhoto[] },
): Promise<ScanResponse> {
  const started = Date.now();
  const { claims, profile, now } = a;
  const userId = claims.sub;
  if (body.context === 'profile_edit' && !profile) throw new AppError('ONBOARDING_REQUIRED');
  const usageDate = localUsageDate(now, profile?.timezone ?? body.timezone);
  const ref = await getReference();
  await assertNoOtherInflight(claims, a.idempotencyKey, now);

  // Tx 1.
  const current = await withUserTx(claims, async (tx) => {
    const usage = await usageRepo.get(tx, userId, usageDate);
    assertCanScan(usage.photoScans);
    return body.context === 'profile_edit' ? equipmentRepo.listUserIds(tx, userId) : [];
  });
  await assertUnderBudget(claims);

  const deadline = createDeadline(SCAN_DEADLINE_MS);
  try {
    const equipment = ref.equipment.map((e) => ({ id: e.id, name: e.name, visualHint: e.visualHint }));
    const result = await runAgent(
      equipmentVisionAgent({ equipment, datasetVersion: ref.datasetVersion }),
      { photos: body.photos, equipment, datasetVersion: ref.datasetVersion },
      {
        requestId: a.requestId,
        userId,
        planId: null,
        mode: 'photo_scan',
        attempt: 1,
        deadline,
        log: dbLogSink(claims),
      },
    );
    if (result.outcome === 'spend_cap') {
      await result.pendingLog.write();
      throw new AppError('SPEND_CAP', { messageCode: 'SPEND_CAP' });
    }
    const order = new Map(ref.equipment.map((e) => [e.id, e.sortOrder]));
    const detected =
      result.outcome === 'ok' ? filterDetections(result.output.detections, order, PHOTO_CONFIDENCE_THRESHOLD) : [];
    const status = scanStatus(detected);
    result.pendingLog.set({ statusCode: status.code });
    await result.pendingLog.write();

    // Tx 2.
    const counted = COUNTED.has(result.outcome);
    const used = await withUserTx(claims, async (tx) => {
      const n = counted ? await usageRepo.incrementScans(tx, userId, usageDate) : null;
      if (counted && n === null) throw new AppError('LIMIT_REACHED', { messageCode: 'PHOTO_LIMIT' });
      await eventRepo.insert(tx, {
        userId,
        eventType: 'photo_scan_completed',
        properties: {
          context: body.context,
          photo_count: body.photos.length,
          detected_count: detected.length,
          latency_ms: Date.now() - started,
        },
        occurredAt: now,
      });
      return n ?? (await usageRepo.get(tx, userId, usageDate)).photoScans;
    });
    return {
      outcome: detected.length > 0 ? 'detected' : 'none',
      detected,
      proposed_selection: proposeSelection(body.context, current, detected, order),
      status,
      photo_scans_remaining_today: scansRemaining(used),
    };
  } finally {
    deadline.dispose();
    body.photos.length = 0; // drop references to the image buffers
  }
}
