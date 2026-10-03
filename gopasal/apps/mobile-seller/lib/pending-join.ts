/**
 * An invite link opened before sign-in.
 *
 * Signing in is three screens and a text message, and the link's token has to
 * survive them: otherwise the new teammate signs in, lands on "register your
 * shop", and has to find the link again. Held in memory only — the token is a
 * credential, and the invite itself expires in days — so a killed app simply
 * asks for the link (or the code) again.
 */
let pending: string | null = null;

export function rememberJoin(token: string): void {
  pending = token;
}

/** The token, once. Reading it clears it, so the gate cannot loop. */
export function takePendingJoin(): string | null {
  const token = pending;
  pending = null;
  return token;
}

export function hasPendingJoin(): boolean {
  return pending !== null;
}
