// Server-only types (safe to import from +page.server.ts, +server.ts, hooks.server.ts).
// Never import these from client code.

import type { JwtPayload } from "jsonwebtoken";

/**
 * Payload stored in JWT tokens for user authentication.
 * Extends JwtPayload to include standard JWT claims (iat, exp, etc.)
 */
export interface TokenPayload extends JwtPayload {
  id: number;
  email: string;
  name: string;
  role: string;
}

/**
 * Payload for one-time tokens that only carry an email address
 * (forgot-password, invitation, email-verify). These tokens do NOT
 * contain id/name/role — use this type instead of TokenPayload to
 * avoid unsafe casts.
 */
export interface EmailTokenPayload extends JwtPayload {
  email: string;
  validTill?: number;
}
