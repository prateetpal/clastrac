import { SignJWT, jwtVerify } from "jose";
import type { NextApiRequest, NextApiResponse } from "next";

const SESSION_COOKIE = "clastrac_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be configured with at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecret());
}

export function setSessionCookie(res: NextApiResponse, token: string): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DURATION_SECONDS}${secure}`
  );
}

export function clearSessionCookie(res: NextApiResponse): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`
  );
}

export async function getSessionUserId(req: NextApiRequest): Promise<string | null> {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) {
    return null;
  }

  const secret = getSecret();
  try {
    const { payload } = await jwtVerify(token, secret);
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function requireSession(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<string | null> {
  const userId = await getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return userId;
}
