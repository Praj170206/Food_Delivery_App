// Edge-safe: imported by proxy.ts, so only `jose` may be used here.
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/lib/constants";

export type TokenPayload = { sub: string; role: Role; tv: number; name: string };

const ISSUER = "greenbite";

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_SECRET must be set and at least 32 characters long");
  return new TextEncoder().encode(s);
}

/** Tokens are bound to one portal via the audience claim. */
export async function signToken(payload: TokenPayload) {
  return new SignJWT({ role: payload.role, tv: payload.tv, name: payload.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setAudience(`portal:${payload.role}`)
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN || "7d")
    .sign(secret());
}

/**
 * Verifies a token for one specific portal. A customer token placed in the admin cookie
 * fails here (wrong audience), even though it is validly signed.
 */
export async function verifyToken(token: string, role: Role): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"], issuer: ISSUER, audience: `portal:${role}` });
    if (!payload.sub || payload.role !== role) return null;
    return { sub: payload.sub, role, tv: Number(payload.tv ?? 0), name: String(payload.name ?? "") };
  } catch {
    return null;
  }
}
