
import fetch from 'node-fetch';

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function verify() {
    console.log('Verifying UI Standardization...');
    let failures = 0;

    // 1. Verify Master Key Status Endpoint
    try {
        const res = await fetch(`${BASE_URL}/api/master-key-status`);
        if (res.ok) {
            const data = await res.json() as any;
            console.log(`✅ GET /api/master-key-status returned 200:`, data);
            if (typeof data.configured !== 'boolean') {
                console.error('❌ Expected { configured: boolean }');
                failures++;
            }
        } else {
            console.error(`❌ GET /api/master-key-status failed: ${res.status}`);
            failures++;
        }
    } catch (e: any) {
        console.error('❌ Failed to fetch master key status', e.message);
        failures++;
    }

    // 2. Verify Root UI serves new HTML
    try {
        const res = await fetch(`${BASE_URL}/`);
        const text = await res.text();
        if (res.ok && text.includes('MCP Server') && text.includes('Provision API Key')) {
            console.log('✅ Root UI serves standardized HTML');
        } else {
            console.error('❌ Root UI does not match expected standardized content');
            failures++;
        }
    } catch (e: any) {
        console.error('❌ Failed to fetch root UI', e.message);
        failures++;
    }

    // 3. Verify App JS serves new content
    try {
        const res = await fetch(`${BASE_URL}/app.js`);
        const text = await res.text();
        if (res.ok && text.includes('setBanner') && text.includes('buildForm')) {
            console.log('✅ app.js serves standardized logic');
        } else {
            console.error('❌ app.js does not match expected content');
            failures++;
        }
    } catch (e: any) {
        console.error('❌ Failed to fetch app.js', e.message);
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
