import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env";

/**
 * Operator authentication for the console.
 *
 * A facility console needs one thing from auth: prove the person at the
 * keyboard is the operator, then keep the doors shut to everyone else. There is
 * no user directory to manage, so a single credential pair guards a signed,
 * self-contained token. The token is stateless — an HMAC over its own payload —
 * so validating it costs a hash and needs no session storage.
 */

export interface AuthUser {
  username: string;
  role: "admin";
}

export interface AuthSession {
  token: string;
  user: AuthUser;
  /** ISO timestamp the token stops being accepted. */
  expiresAt: string;
}

interface TokenPayload {
  sub: string;
  exp: number;
}

/** Constant-time comparison that tolerates unequal lengths without throwing. */
function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function sign(payload: string): string {
  return createHmac("sha256", env.auth.tokenSecret).update(payload).digest("base64url");
}

export function verifyCredentials(username: string, password: string): boolean {
  // Both halves are compared even when the username is wrong, so a bad username
  // and a bad password cost the same.
  const usernameOk = safeEqual(username, env.auth.username);
  const passwordOk = safeEqual(password, env.auth.password);
  return usernameOk && passwordOk;
}

export function issueToken(username: string): AuthSession {
  const expiresAt = Date.now() + env.auth.tokenTtlMs;
  const payload: TokenPayload = { sub: username, exp: expiresAt };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");

  return {
    token: `${encoded}.${sign(encoded)}`,
    user: { username, role: "admin" },
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export function verifyToken(token: string | null | undefined): AuthUser | null {
  if (typeof token !== "string" || token === "") return null;

  const [encoded, signature] = token.split(".");
  if (encoded === undefined || signature === undefined) return null;
  if (!safeEqual(signature, sign(encoded))) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<TokenPayload>;

    if (typeof decoded.sub !== "string" || typeof decoded.exp !== "number") return null;
    if (Date.now() > decoded.exp) return null;

    return { username: decoded.sub, role: "admin" };
  } catch {
    return null;
  }
}

/** Pulls the token out of an `Authorization: Bearer …` header. */
export function bearerToken(header: string | undefined): string | null {
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}