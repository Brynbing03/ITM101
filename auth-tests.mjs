import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthHandler, ENDPOINT, hash, seal, unseal } from './server/auth.mjs';

const origin = 'https://magnificent-tarsier-51948c.netlify.app';
const env = { APP_ORIGIN: origin, GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret', SESSION_SECRET: 'a'.repeat(64) };
const clock = 1792600000000;
function fixture({ profile = {}, rows = [], dbError = false, verifyError = false } = {}) {
    const calls = [];
    let authOptions;
    let tokenOptions;
    const handler = createAuthHandler({
        env, now: () => clock,
        database: async () => ({ sql: async (parts, ...values) => {
            const query = parts.join('?');
            calls.push({ query, values });
            if (dbError) throw new Error('private database detail');
            return query.startsWith('INSERT INTO myday_users') ? [{ id: 'account-id' }] : rows;
        } }),
        googleClient: async redirect => {
            assert.equal(redirect, origin + ENDPOINT + '?action=callback');
            return {
                generateAuthUrl: options => { authOptions = options; return 'https://accounts.google.com/o/oauth2/v2/auth'; },
                getToken: async options => { tokenOptions = options; return { tokens: { id_token: 'signed-google-token' } }; },
                verifyIdToken: async options => {
                    assert.deepEqual(options, { idToken: 'signed-google-token', audience: 'client' });
                    if (verifyError) throw new Error('invalid signature');
                    return { getPayload: () => ({ sub: 'google-id', email: 'me@example.com', email_verified: true, name: 'My Name', nonce: 'nonce', ...profile }) };
                },
            };
        },
    });
    const request = (action, options) => handler(new Request(`${origin}${ENDPOINT}?action=${action}`, options));
    const flow = seal({ state: 'state', nonce: 'nonce', verifier: 'verifier', expires: clock + 10000 }, env.SESSION_SECRET);
    const callback = (suffix = '', cookie = flow) => request(`callback&state=state&code=code${suffix}`, { headers: { cookie: `__Host-myday_oauth=${cookie}` } });
    return { request, callback, calls, get authOptions() { return authOptions; }, get tokenOptions() { return tokenOptions; } };
}

test('signed OAuth flow rejects tampering and expiry', () => {
    const value = seal({ expires: clock + 10, state: 'state' }, env.SESSION_SECRET);
    assert.equal(unseal(value, env.SESSION_SECRET, clock).state, 'state');
    assert.equal(unseal(value, env.SESSION_SECRET, clock + 10), null);
    assert.equal(unseal(value + 'x', env.SESSION_SECRET, clock), null);
    assert.equal(unseal(value, 'wrong secret', clock), null);
});

test('login uses a secure temporary cookie, nonce, state and PKCE', async () => {
    const f = fixture();
    const response = await f.request('login');
    assert.equal(response.status, 303);
    const cookie = response.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
    const flow = unseal(cookie.split(';')[0].split('=')[1], env.SESSION_SECRET, clock);
    assert.equal(flow.state, f.authOptions.state);
    assert.equal(flow.nonce, f.authOptions.nonce);
    assert.equal(f.authOptions.code_challenge_method, 'S256');
    assert.notEqual(f.authOptions.code_challenge, flow.verifier);
});

test('callback rejects missing, tampered and mismatched flow before accessing database', async () => {
    const f = fixture();
    for (const cookie of ['', 'tampered', seal({ state: 'wrong', expires: clock + 10 }, env.SESSION_SECRET)]) {
        const response = await f.callback('', cookie);
        assert.match(response.headers.get('location'), /auth_error=invalid_state/);
    }
    assert.equal(f.calls.length, 0);
});

test('verified callback upserts Google subject and stores only a hashed session', async () => {
    const f = fixture();
    const response = await f.callback();
    assert.equal(response.headers.get('location'), origin + '/');
    assert.deepEqual(f.tokenOptions, { code: 'code', codeVerifier: 'verifier' });
    const session = response.headers.getSetCookie().find(value => value.startsWith('__Host-myday_session='));
    const token = session.split(';')[0].split('=')[1];
    assert.match(session, /HttpOnly; SameSite=Lax; Max-Age=604800; Secure/);
    assert.match(f.calls[0].query, /ON CONFLICT \(google_sub\)/);
    assert.equal(f.calls[0].values[1], 'google-id');
    assert.equal(f.calls[2].values[0], hash(token));
    assert.equal(f.calls[2].values[1], 'account-id');
    assert.ok(!JSON.stringify(f.calls).includes('signed-google-token'));
});

test('invalid Google tokens, nonce, unverified email and provider denial cannot create sessions', async () => {
    for (const options of [{ verifyError: true }, { profile: { nonce: 'other' } }, { profile: { email_verified: false } }]) {
        const f = fixture(options);
        const response = await f.callback();
        assert.match(response.headers.get('location'), /auth_error=failed/);
        assert.equal(f.calls.length, 0);
    }
    const f = fixture();
    assert.match((await f.callback('&error=access_denied')).headers.get('location'), /auth_error=cancelled/);
    assert.equal(f.calls.length, 0);
});

test('session lookup enforces expiry and clears stale cookies', async () => {
    const f = fixture();
    assert.deepEqual(await (await f.request('session')).json(), { user: null });
    assert.equal(f.calls.length, 0);
    const response = await f.request('session', { headers: { cookie: '__Host-myday_session=expired' } });
    assert.match(f.calls[0].query, /s.expires_at > now\(\)/);
    assert.deepEqual(f.calls[0].values, [hash('expired')]);
    assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('logout requires same-origin POST and revokes the database session', async () => {
    const f = fixture();
    assert.equal((await f.request('logout')).status, 405);
    assert.equal((await f.request('logout', { method: 'POST', headers: { origin: 'https://other.example' } })).status, 403);
    assert.equal(f.calls.length, 0);
    const response = await f.request('logout', { method: 'POST', headers: { origin, cookie: '__Host-myday_session=token' } });
    assert.equal(response.status, 200);
    assert.match(f.calls[0].query, /DELETE FROM myday_sessions/);
    assert.deepEqual(f.calls[0].values, [hash('token')]);
    assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
});

test('configuration and database failures fail closed without exposing secrets', async () => {
    const handler = createAuthHandler({ env: {} });
    assert.equal((await handler(new Request(origin + ENDPOINT))).status, 503);
    const f = fixture({ dbError: true });
    const response = await f.request('session', { headers: { cookie: '__Host-myday_session=token' } });
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes('private database detail'));
    assert.equal((await f.callback()).headers.getSetCookie().some(value => value.startsWith('__Host-myday_session=')), false);
});
