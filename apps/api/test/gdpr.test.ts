import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { EXPORT_TABLES } from '@apex/shared';
import { profiles, sessions, users } from '../src/db/schema.js';
import { bearer, createHarness, signup, totpCode, type TestHarness } from './helpers.js';

let h: TestHarness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

describe('GDPR export', () => {
  it('returns every owned table with the user rows, secrets redacted', async () => {
    const user = await signup(h.app, { sex: 'male', dateOfBirth: '1992-03-04' });
    const other = await signup(h.app);

    await h.app.inject({
      method: 'POST',
      url: '/me/bodyweight',
      headers: bearer(user.accessToken),
      payload: { weight: 82.5 },
    });
    await h.app.inject({
      method: 'POST',
      url: '/me/privacy-zones',
      headers: bearer(user.accessToken),
      payload: { label: 'Home', centerLat: 51.5, centerLng: -0.12 },
    });
    await h.app.inject({
      method: 'PUT',
      url: `/me/blocks/${other.id}`,
      headers: bearer(user.accessToken),
    });
    await h.app.inject({
      method: 'PUT',
      url: `/me/mutes/${other.id}`,
      headers: bearer(user.accessToken),
    });
    await h.app.inject({
      method: 'POST',
      url: '/reports',
      headers: bearer(user.accessToken),
      payload: { targetUserId: other.id, reason: 'spam' },
    });
    await h.app.inject({
      method: 'POST',
      url: '/auth/totp/enroll',
      headers: bearer(user.accessToken),
    });
    await h.app.inject({
      method: 'POST',
      url: '/auth/totp/confirm',
      headers: bearer(user.accessToken),
      payload: { code: (await totpCode(h.ctx, user.id))! },
    });

    const res = await h.app.inject({
      method: 'GET',
      url: '/me/export',
      headers: bearer(user.accessToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');

    const body = res.json();
    expect(body.format).toBe('apex.export.v1');
    expect(body.userId).toBe(user.id);
    expect(Object.keys(body.tables).sort()).toEqual([...EXPORT_TABLES].sort());

    expect(body.tables.users).toHaveLength(1);
    expect(body.tables.profiles).toHaveLength(1);
    expect(body.tables.privacy_settings).toHaveLength(1);
    expect(body.tables.privacy_zones).toHaveLength(1);
    expect(body.tables.bodyweight_entries).toHaveLength(1);
    expect(body.tables.blocks).toHaveLength(1);
    expect(body.tables.mutes).toHaveLength(1);
    expect(body.tables.reports).toHaveLength(1);
    expect(body.tables.sessions.length).toBeGreaterThan(0);
    expect(body.tables.totp_credentials).toHaveLength(1);
    expect(body.tables.recovery_codes).toHaveLength(10);
    expect(body.tables.email_tokens.length).toBeGreaterThan(0);
    expect(body.tables.identities).toHaveLength(0);

    expect(body.tables.sessions[0].refreshTokenHash).toBe('[redacted]');
    expect(body.tables.totp_credentials[0].secretCiphertext).toBe('[redacted]');
    expect(body.tables.recovery_codes[0].codeHash).toBe('[redacted]');
    expect(body.tables.profiles[0].dateOfBirth).toBe('1992-03-04');
  });
});

describe('account deletion', () => {
  it('requires the correct password and the typed confirmation', async () => {
    const user = await signup(h.app);
    const noConfirm = await h.app.inject({
      method: 'DELETE',
      url: '/me/account',
      headers: bearer(user.accessToken),
      payload: { password: user.password, confirm: 'yes' },
    });
    expect(noConfirm.statusCode).toBe(400);

    const wrongPassword = await h.app.inject({
      method: 'DELETE',
      url: '/me/account',
      headers: bearer(user.accessToken),
      payload: { password: 'not-the-password', confirm: 'DELETE' },
    });
    expect(wrongPassword.statusCode).toBe(401);
  });

  it('soft-deletes, anonymises PII and revokes every session', async () => {
    const user = await signup(h.app);
    await h.app.inject({
      method: 'PATCH',
      url: '/me/profile',
      headers: bearer(user.accessToken),
      payload: { bio: 'Personal details', sex: 'female', dateOfBirth: '1988-08-08' },
    });
    await h.app.inject({
      method: 'POST',
      url: '/me/bodyweight',
      headers: bearer(user.accessToken),
      payload: { weight: 64 },
    });
    await h.app.inject({
      method: 'POST',
      url: '/me/privacy-zones',
      headers: bearer(user.accessToken),
      payload: { label: 'Home', centerLat: 1, centerLng: 1 },
    });

    const res = await h.app.inject({
      method: 'DELETE',
      url: '/me/account',
      headers: bearer(user.accessToken),
      payload: { password: user.password, confirm: 'DELETE' },
    });
    expect(res.statusCode).toBe(200);

    const [row] = await h.db.select().from(users).where(eq(users.id, user.id));
    expect(row!.status).toBe('deleted');
    expect(row!.deletedAt).not.toBeNull();
    expect(row!.email).not.toBe(user.email);
    expect(row!.email).toContain('@deleted.invalid');

    const [profile] = await h.db.select().from(profiles).where(eq(profiles.userId, user.id));
    expect(profile!.displayName).toBe('Deleted user');
    expect(profile!.bio).toBeNull();
    expect(profile!.dateOfBirth).toBeNull();
    expect(profile!.sex).toBe('unspecified');

    const activeSessions = (
      await h.db.select().from(sessions).where(eq(sessions.userId, user.id))
    ).filter((s) => s.revokedAt === null);
    expect(activeSessions).toHaveLength(0);

    const afterDelete = await h.app.inject({
      method: 'GET',
      url: '/me/profile',
      headers: bearer(user.accessToken),
    });
    expect(afterDelete.statusCode).toBe(401);

    const login = await h.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: user.password },
    });
    expect(login.statusCode).toBe(401);

    const lookup = await h.app.inject({ method: 'GET', url: `/users/${user.id}` });
    expect(lookup.statusCode).toBe(404);

    const refresh = await h.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: user.refreshToken },
    });
    expect(refresh.statusCode).toBe(401);
  });
});
