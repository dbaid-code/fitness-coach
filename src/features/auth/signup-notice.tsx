import { renderMessage } from '@/shared/messages/render-message';

/** FR-3 / D-27: the catalog SIGNUP_NOTICE on a secondary box. */
export function SignupNotice() {
  return (
    <p className="rounded-md bg-secondary px-3.5 py-3 text-meta text-strong-muted">{renderMessage('SIGNUP_NOTICE')}</p>
  );
}
