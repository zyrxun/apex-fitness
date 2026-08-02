import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { v7 as uuidv7 } from 'uuid';

export const newId = (): string => uuidv7();

// argon2id is @node-rs/argon2's default algorithm; the enum can't be imported
// under isolatedModules, so the parameters below are the OWASP-recommended
// baseline (19 MiB, t=2, p=1) rather than an explicit algorithm override.
const ARGON_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const hashPassword = (plain: string): Promise<string> => argonHash(plain, ARGON_OPTIONS);

export async function verifyPassword(hashValue: string, plain: string): Promise<boolean> {
  try {
    return await argonVerify(hashValue, plain, ARGON_OPTIONS);
  } catch {
    return false;
  }
}

/** Opaque high-entropy token for refresh tokens, email links and MFA tickets. */
export const generateOpaqueToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/**
 * Tokens are already 256-bit random, so a fast digest is the correct primitive
 * here — argon2 would only add latency to every refresh.
 */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface SealedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

export function sealSecret(plaintext: string, keyHex: string): SealedSecret {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function openSecret(sealed: SealedSecret, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRecoveryCode(): string {
  const pick = (n: number) =>
    Array.from(randomBytes(n))
      .map((b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length])
      .join('');
  return `${pick(5)}-${pick(5)}`;
}

export const normalizeRecoveryCode = (code: string): string =>
  code.trim().toUpperCase().replace(/\s+/g, '');
