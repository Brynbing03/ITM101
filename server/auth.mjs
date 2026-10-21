import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export const ENDPOINT = '/.netlify/functions/auth';
const SESSION_AGE = 60 * 60 * 24 * 7;
const FLOW_AGE = 600;
const random = () => randomBytes(32).toString('base64url');
export const hash = value => createHash('sha256').update(value).digest('hex');
const challenge = value => createHash('sha256').update(value).digest('base64url');

export function seal(value, secret) {
    const body = Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

export function unseal(value, secret, now = Date.now()) {
    try {
        const [body, signature, extra] = value.split('.');
        if (extra !== undefined || !body || !signature) return null;
        const expected = createHmac('sha256', secret).update(body).digest();
        const received = Buffer.from(signature, 'base64url');
        if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
        const data = JSON.parse(Buffer.from(body, 'base64url').toString());
        return Number.isFinite(data.expires) && data.expires > now ? data : null;
    } catch { return null; }
}

function cookies(request) {
    return Object.fromEntries((request.headers.get('cookie') || '').split(';').map(part => {
        const index = part.indexOf('=');
        return index < 0 ? ['', ''] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
    }));
}

// Dependencies are injected so security behavior can be checked without live credentials.
export function createAuthHandler({ env, database, googleClient, now = Date.now }) {
    return async request => {
        const url = new URL(request.url);
        const action = url.searchParams.get('action') || 'session';
        const origin = env.APP_ORIGIN?.replace(/\/$/, '');
        const local = origin === 'http://localhost:8888';
        const prefix = local ? '' : '__Host-';
        const sessionName = `${prefix}myday_session`;
        const flowName = `${prefix}myday_oauth`;
        const headers = new Headers({ 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
        const cookie = (name, value, age) => headers.append('Set-Cookie', `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${local ? '' : '; Secure'}`);
        const json = (data, status = 200) => {
            headers.set('Content-Type', 'application/json; charset=utf-8');
            return new Response(JSON.stringify(data), { status, headers });
        };
        const redirect = destination => {
            headers.set('Location', destination);
            return new Response(null, { status: 303, headers });
        };
        const failLogin = reason => {
            cookie(flowName, '', 0);
            return redirect(`${origin}/?auth_error=${reason}`);
        };
        if (!origin || (!local && !/^https:\/\/[^/]+$/.test(origin)) ||
            !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || env.SESSION_SECRET?.length < 32 || !env.SESSION_SECRET) {
            return json({ error: 'Google sign-in has not been configured on this site.' }, 503);
        }
        // Do not send production cookies or accept login callbacks on unconfigured hosts.
        if (url.origin !== origin) return json({ error: 'Use the configured app address to sign in.' }, 400);
        if (!['login', 'callback', 'session', 'logout'].includes(action)) return json({ error: 'Not found.' }, 404);
        if (request.method !== (action === 'logout' ? 'POST' : 'GET')) return json({ error: 'Method not allowed.' }, 405);
        const jar = cookies(request);
        const redirectUri = `${origin}${ENDPOINT}?action=callback`;
        try {
            if (action === 'login') {
                const flow = { state: random(), nonce: random(), verifier: random(), expires: now() + FLOW_AGE * 1000 };
                cookie(flowName, seal(flow, env.SESSION_SECRET), FLOW_AGE);
                const client = await googleClient(redirectUri);
                return redirect(client.generateAuthUrl({
                    scope: ['openid', 'email', 'profile'], state: flow.state, nonce: flow.nonce,
                    code_challenge: challenge(flow.verifier), code_challenge_method: 'S256',
                    prompt: 'select_account',
                }));
            }
            if (action === 'callback') {
                const flow = unseal(jar[flowName] || '', env.SESSION_SECRET, now());
                if (!flow || flow.state !== url.searchParams.get('state')) return failLogin('invalid_state');
                if (url.searchParams.has('error')) return failLogin('cancelled');
                const code = url.searchParams.get('code');
                if (!code) return failLogin('failed');
                const client = await googleClient(redirectUri);
                const { tokens } = await client.getToken({ code, codeVerifier: flow.verifier });
                if (!tokens.id_token) return failLogin('failed');
                const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
                const profile = ticket.getPayload();
                if (!profile?.sub || !profile.email || profile.email_verified !== true || profile.nonce !== flow.nonce) return failLogin('failed');
                const db = await database();
                const users = await db.sql`INSERT INTO myday_users (id, google_sub, email, display_name)
                    VALUES (${randomUUID()}, ${profile.sub}, ${profile.email}, ${profile.name || profile.email})
                    ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email,
                        display_name = EXCLUDED.display_name, last_login_at = now()
                    RETURNING id`;
                const token = random();
                await db.sql`DELETE FROM myday_sessions WHERE expires_at <= now()`;
                await db.sql`INSERT INTO myday_sessions (token_hash, user_id, expires_at)
                    VALUES (${hash(token)}, ${users[0].id}, ${new Date(now() + SESSION_AGE * 1000).toISOString()})`;
                cookie(flowName, '', 0);
                cookie(sessionName, token, SESSION_AGE);
                return redirect(`${origin}/`);
            }
            if (action === 'logout') {
                if (request.headers.get('origin') !== origin) return json({ error: 'Invalid origin.' }, 403);
                if (jar[sessionName]) {
                    const db = await database();
                    await db.sql`DELETE FROM myday_sessions WHERE token_hash = ${hash(jar[sessionName])}`;
                }
                cookie(sessionName, '', 0);
                return json({ user: null });
            }
            if (!jar[sessionName]) return json({ user: null });
            const db = await database();
            const rows = await db.sql`SELECT u.id, u.email, u.display_name AS name
                FROM myday_users u JOIN myday_sessions s ON s.user_id = u.id
                WHERE s.token_hash = ${hash(jar[sessionName])} AND s.expires_at > now()`;
            if (!rows.length) cookie(sessionName, '', 0);
            return json({ user: rows[0] || null });
        } catch {
            // Never send provider tokens, credentials, or database errors to the browser/logs.
            if (action === 'callback') return failLogin('failed');
            return json({ error: 'Sign-in is temporarily unavailable. Please try again.' }, 503);
        }
    };
}
