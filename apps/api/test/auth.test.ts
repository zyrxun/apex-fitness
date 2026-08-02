import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '../src/db/schema.js';
import { bearer, createHarness, signup, totpCode, type TestHarness } from './helpers.js';

let h: TestHarness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

describe('health + docs', () => {
  it('serves /health', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('serves the OpenAPI document', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.info.title).toBe('Apex Fitness API');
    expect(Object.keys(spec.paths)).toContain('/auth/login');
  });
});

describe('signup → verify → login', () => {
  it('creates a user, profile and privacy defaults, then verifies and logs in', async () => {
    const user = await signup(h.app);
    expect(user.id).toBeTruthy();

    expect(h.mail.some((m) => m.to === user.email && m.meta?.purpose === 'verify_email')).toBe(
      true,
    );

    const profile = await h.app.inject({
      method: 'GET',
      url: '/me/profile',
      headers: bearer(user.accessToken),
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().displayName).toBe('Test Athlete');
    expect(profile.json().units).toBe('metric');

    const verify = await h.app.inject({
      method: 'POST',
      url: '/auth/verify-email',
      payload: { token: user.verificationToken },
    });
    expect(verify.statusCode).toBe(200);

    const [row] = await h.db.select().from(users).where(eq(users.id, user.id));
    expect(row!.emailVerifiedAt).not.toBeNull();
    expect(row!.region).toBe('global');

    const login = await h.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: user.password },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().status).toBe('authenticated');
    expect(login.json().user.emailVerified).toBe(true);
  });

  it('rejects a wrong password without revealing whether the account exists', async () => {
    const user = await signup(h.app);
    const res = await h.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: 'definitely-not-it' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('invalid_credentials');

    const unknown = await h.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@example.com', password: 'definitely-not-it' },
    });
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json().error.code).toBe('invalid_credentials');
  });

  it('rejects a duplicate email', async () => {
    const user = await signup(h.app);
    const res = await h.app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: user.email, password: 'another-long-password', displayName: 'Clone' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('email_taken');
  });

  it('rejects a stale verification token', async () => {
    const user = await signup(h.app);
    await h.app.inject({
      method: 'POST',
      url: '/auth/verify-email',
      payload: { token: user.verificationToken },
    });
    const replay = await h.app.inject({
      method: 'POST',
      url: '/auth/verify-email',
      payload: { token: user.verificationToken },
    });
    expect(replay.statusCode).toBe(400);
  });
});

describe('refresh rotation and reuse detection', () => {
  it('rotates the refresh token and invalidates the old one', async () => {
    const user = await signup(h.app);
    const first = await h.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: user.refreshToken },
    });
    expect(first.statusCode).toBe(200);
    const rotated = first.json().refreshToken;
    expect(rotated).not.toBe(user.refreshToken);

    const second = await h.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: rotated },
    });
    expect(second.statusCode).toBe(200);
  });

  it('burns the whole family when a rotated token is replayed', async () => {
    const user = await signup(h.app);
    const rotate = await h.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: user.refreshToken },
    });
    const live = rotate.json().refreshToken;

    const replay = await h.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: user.refreshToken },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.code).toBe('refresh_token_reused');

    const afterBurn = await h.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: live },
    });
    expect(afterBurn.statusCode).toBe(401);
  });

  it('rejects an unknown refresh token', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'not-a-real-token' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('invalid_refresh_token');
  });
});

describe('sessions and logout', () => {
  it('lists active sessions and revokes one by id', async () => {
    const user = await signup(h.app);
    const login = await h.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: user.password },
    });
    const second = login.json().tokens;

    const list = await h.app.inject({
      method: 'GET',
      url: '/auth/sessions',
      headers: bearer(second.accessToken),
    });
    expect(list.statusCode).toBe(200);
    const sessions = list.json().sessions;
    expect(sessions.length).toBe(2);
    expect(sessions.filter((s: { current: boolean }) => s.current).length).toBe(1);

    const other = sessions.find((s: { current: boolean }) => !s.current)!;
    const del = await h.app.inject({
      method: 'DELETE',
      url: `/auth/sessions/${other.id}`,
      headers: bearer(second.accessToken),
    });
    expect(del.statusCode).toBe(200);

    const stale = await h.app.inject({
      method: 'GET',
      url: '/me/profile',
      headers: bearer(user.accessToken),
    });
    expect(stale.statusCode).toBe(401);
    expect(stale.json().error.code).toBe('session_revoked');
  });

  it('logout revokes the session family', async () => {
    const user = await signup(h.app);
    const out = await h.app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken: user.refreshToken },
    });
    expect(out.statusCode).toBe(200);

    const after = await h.app.inject({
      method: 'GET',
      url: '/me/profile',
      headers: bearer(user.accessToken),
    });
    expect(after.statusCode).toBe(401);
  });

  it('rejects requests without a bearer token', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/me/profile' });
    expect(res.statusCode).toBe(401);
  });
});

describe('password reset', () => {
  it('issues a reset token, changes the password and revokes sessions', async () => {
    const user = await signup(h.app);
    const forgot = await h.app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: user.email },
    });
    expect(forgot.statusCode).toBe(200);
    const resetToken = forgot.json().resetToken;
    expect(resetToken).toBeTruthy();

    const reset = await h.app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: resetToken, password: 'a-brand-new-password' },
    });
    expect(reset.statusCode).toBe(200);

    const oldSession = await h.app.inject({
      method: 'GET',
      url: '/me/profile',
      headers: bearer(user.accessToken),
    });
    expect(oldSession.statusCode).toBe(401);

    const oldPassword = await h.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: user.password },
    });
    expect(oldPassword.statusCode).toBe(401);

    const newPassword = await h.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: 'a-brand-new-password' },
    });
    expect(newPassword.statusCode).toBe(200);
  });

  it('does not leak whether an email exists', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: 'ghost@example.com' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().resetToken).toBeUndefined();
  });
});

describe('TOTP two-factor', () => {
  it('enrolls, confirms, then requires a second step at login', async () => {
    const user = await signup(h.app);

    const enroll = await h.app.inject({
      method: 'POST',
      url: '/auth/totp/enroll',
      headers: bearer(user.accessToken),
    });
    expect(enroll.statusCode).toBe(200);
    expect(enroll.json().otpauthUrl).toMatch(/^otpauth:\/\/totp\//);

    const wrong = await h.app.inject({
      method: 'POST',
      url: '/auth/totp/confirm',
      headers: bearer(user.accessToken),
      payload: { code: '000000' },
    });
    expect(wrong.statusCode).toBe(400);

    const confirm = await h.app.inject({
      method: 'POST',
      url: '/auth/totp/confirm',
      headers: bearer(user.accessToken),
      payload: { code: (await totpCode(h.ctx, user.id))! },
    });
    expect(confirm.statusCode).toBe(200);
    const recoveryCodes: string[] = confirm.json().recoveryCodes;
    expect(recoveryCodes.length).toBe(10);

    const login = await h.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: user.password },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().status).toBe('mfa_required');
    const ticket = login.json().mfaTicket;

    const badCode = await h.app.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      payload: { mfaTicket: ticket, code: '111111' },
    });
    expect(badCode.statusCode).toBe(401);

    const login2 = await h.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: user.password },
    });
    const verified = await h.app.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      payload: { mfaTicket: login2.json().mfaTicket, code: (await totpCode(h.ctx, user.id))! },
    });
    expect(verified.statusCode).toBe(200);
    expect(verified.json().status).toBe('authenticated');

    const login3 = await h.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: user.password },
    });
    const withRecovery = await h.app.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      payload: { mfaTicket: login3.json().mfaTicket, code: recoveryCodes[0]! },
    });
    expect(withRecovery.statusCode).toBe(200);

    const login4 = await h.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: user.password },
    });
    const reusedRecovery = await h.app.inject({
      method: 'POST',
      url: '/auth/mfa/verify',
      payload: { mfaTicket: login4.json().mfaTicket, code: recoveryCodes[0]! },
    });
    expect(reusedRecovery.statusCode).toBe(401);
  });

  it('disables TOTP only with the correct password', async () => {
    const user = await signup(h.app);
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

    const wrong = await h.app.inject({
      method: 'POST',
      url: '/auth/totp/disable',
      headers: bearer(user.accessToken),
      payload: { password: 'nope-nope-nope' },
    });
    expect(wrong.statusCode).toBe(401);

    const disabled = await h.app.inject({
      method: 'POST',
      url: '/auth/totp/disable',
      headers: bearer(user.accessToken),
      payload: { password: user.password },
    });
    expect(disabled.statusCode).toBe(200);

    const login = await h.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: user.password },
    });
    expect(login.json().status).toBe('authenticated');
  });
});

describe('third-party sign-in seam', () => {
  it.each(['/auth/apple', '/auth/google'])('%s returns 501 until configured', async (url) => {
    const res = await h.app.inject({
      method: 'POST',
      url,
      payload: { provider: url.endsWith('apple') ? 'apple' : 'google', idToken: 'x' },
    });
    expect(res.statusCode).toBe(501);
    expect(res.json().error.code).toBe('oauth_not_configured');
  });
});
