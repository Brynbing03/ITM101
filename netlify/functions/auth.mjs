import { createAuthHandler } from '../../server/auth.mjs';

export default createAuthHandler({
    env: process.env,
    database: async () => {
        const { getDatabase } = await import('@netlify/database');
        return getDatabase();
    },
    googleClient: async redirectUri => {
        const { OAuth2Client } = await import('google-auth-library');
        return new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri);
    },
});
