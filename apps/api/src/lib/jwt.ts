import { SignJWT, jwtVerify } from 'jose';

export interface AccessTokenClaims {
  sub: string;
  region: string;
  sid: string;
}

const encoder = new TextEncoder();

export async function signAccessToken(
  claims: AccessTokenClaims,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ region: claims.region, sid: claims.sid })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .setIssuer('apex-fitness')
    .setAudience('apex-api')
    .sign(encoder.encode(secret));
}

export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(secret), {
      issuer: 'apex-fitness',
      audience: 'apex-api',
    });
    if (typeof payload.sub !== 'string') return null;
    return {
      sub: payload.sub,
      region: typeof payload.region === 'string' ? payload.region : 'global',
      sid: typeof payload.sid === 'string' ? payload.sid : '',
    };
  } catch {
    return null;
  }
}
