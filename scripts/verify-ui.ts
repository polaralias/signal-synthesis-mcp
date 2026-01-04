import fetch from 'node-fetch';

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function verify() {
    console.log('Verifying standard UI and APIs...');

    try {
        // 1. Verify GET / returns HTML
        const rootRes = await fetch(`${BASE_URL}/`);
        const rootText = await rootRes.text();
        if (rootRes.ok && rootText.includes('<!DOCTYPE html>') && rootText.includes('Signal Synthesis MCP')) {
            console.log('✅ GET / serves correctly');
        } else {
            console.log('❌ GET / failed or returned unexpected content');
        }

        // 2. Verify GET /api/config-status
        const statusRes = await fetch(`${BASE_URL}/api/config-status`);
        const statusJson = await statusRes.json() as { status: string };
        if (statusRes.ok && (statusJson.status === 'present' || statusJson.status === 'missing')) {
            console.log(`✅ GET /api/config-status works: ${statusJson.status}`);
        } else {
            console.log('❌ GET /api/config-status failed');
        }

        // 3. Verify GET /api/connections
        const connectionsRes = await fetch(`${BASE_URL}/api/connections`);
        if (connectionsRes.ok) {
            console.log('✅ GET /api/connections works');
        } else {
            console.log('❌ GET /api/connections failed');
        }

        // 4. Verify OAuth parameters still render Connect UI
        const oauthRes = await fetch(`${BASE_URL}/?redirect_uri=http://localhost/cb&state=foo&code_challenge=bar&code_challenge_method=S256`);
        const oauthText = await oauthRes.text();
        if (oauthRes.ok && oauthText.includes('Connect Signal Synthesis MCP')) {
            console.log('✅ OAuth params correctly render Connect UI');
        } else {
            console.log('❌ OAuth params failed to render Connect UI');
        }

    } catch (err: any) {
        console.error('❌ Verification failed:', err.message);
    }
}

verify();
