// Session auth: a signed JWT (HS256, AUTH_SECRET) in an httpOnly cookie.
// Roles: TRADER (own strategy only, can trade) and COMPLIANCE (all strategies, surveillance).
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";

export type Role = "TRADER" | "COMPLIANCE";
export type Session = { uid: number; username: string; role: Role; strategyId: number | null };

const COOKIE = "session";
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET ?? "");

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function createSession(s: Session) {
  const token = await new SignJWT({ ...s }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").sign(key());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 8 * 3600 });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload as unknown as Session;
  } catch (e) {
    unstable_rethrow(e);
    return null; // invalid or expired token
  }
}

/** Throws 401 when not logged in and 403 when the role is not allowed. */
export async function requireSession(...roles: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Not logged in");
  if (roles.length && !roles.includes(s.role)) throw new HttpError(403, `Requires role ${roles.join(" or ")}`);
  return s;
}
