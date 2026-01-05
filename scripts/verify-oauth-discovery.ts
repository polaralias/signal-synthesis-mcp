
import fetch from 'node-fetch';

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function verify() {
    console.log('Verifying OAuth Discovery and UI...');
    let failures = 0;

    // 1. Verify OAuth Protected Resource Metadata
    try {
        const res = await fetch(`${BASE_URL}/.well-known/oauth-protected-resource`);
        const data = await res.json() as any;

        if (res.ok &&
            data.bearer_methods_supported?.includes('header') &&
            data.resource_documentation) {
            console.log('✅ OAuth Metadata correct');
        } else {
            console.error('❌ OAuth Metadata invalid', data);
            failures++;
        }
    } catch (e: any) {
        console.error('❌ Failed to fetch metadata', e.message);
        failures++;
    }

    // 2. Verify WWW-Authenticate Header on 401
    try {
        const res = await fetch(`${BASE_URL}/mcp`, { method: 'POST' }); // Should be 401
        const authHeader = res.headers.get('www-authenticate');

        if (res.status === 401 &&
            authHeader?.includes('Bearer') &&
            authHeader?.includes('resource_metadata=')) {
            console.log('✅ WWW-Authenticate header present on 401');
        } else {
            console.error('❌ Missing or invalid WWW-Authenticate header', { status: res.status, header: authHeader });
            failures++;
        }
    } catch (e: any) {
        console.error('❌ Failed to check 401 header', e.message);
        failures++;
    }

    if (failures === 0) {
        console.log('\n✨ All checks passed!');
    } else {
        console.error(`\n❌ ${failures} checks failed.`);
        process.exit(1);
    }
}

verify();
