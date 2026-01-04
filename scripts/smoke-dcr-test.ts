import fetch from 'node-fetch';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function testDCR() {
    console.log('--- Starting DCR Smoke Test ---');

    try {
        // 1. Check Metadata
        console.log('\n1. Checking Metadata...');
        const metadataRes = await fetch(`${BASE_URL}/.well-known/oauth-authorization-server`);
        if (!metadataRes.ok) throw new Error(`Metadata check failed: ${metadataRes.status}`);
        const metadata = await metadataRes.json() as any;
        console.log('Metadata:', JSON.stringify(metadata, null, 2));
        if (!metadata.registration_endpoint) throw new Error('Missing registration_endpoint');

        // 2. Register Client
        console.log('\n2. Registering Client...');
        const registerRes = await fetch(`${BASE_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                redirect_uris: ['https://example.com/callback'],
                client_name: 'Smoke Test Client'
            })
        });
        if (!registerRes.ok) throw new Error(`Registration failed: ${registerRes.status} ${await registerRes.text()}`);
        const registration = await registerRes.json() as any;
        console.log('Registration Response:', JSON.stringify(registration, null, 2));
        const clientId = registration.client_id;
        if (!clientId) throw new Error('Registration failed: no client_id');

        // 3. Test /connect (GET) - validation only
        console.log('\n3. Testing /connect validation...');

        // Invalid redirect URI
        const res1 = await fetch(`${BASE_URL}/connect?redirect_uri=https://wrong.com&state=test&code_challenge=cc&code_challenge_method=S256&client_id=${clientId}`);
        if (res1.status === 400 || res1.status === 401) {
            console.log('Caught expected error for invalid redirect_uri:', await res1.text());
        } else {
            throw new Error(`Expected error for invalid redirect_uri, got ${res1.status}`);
        }

        // Invalid client ID
        const res2 = await fetch(`${BASE_URL}/connect?redirect_uri=https://example.com/callback&state=test&code_challenge=cc&code_challenge_method=S256&client_id=invalid-client`);
        if (res2.status === 400 || res2.status === 401) {
            console.log('Caught expected error for invalid client_id:', await res2.text());
        } else {
            throw new Error(`Expected error for invalid client_id, got ${res2.status}`);
        }

        // Valid request
        const res3 = await fetch(`${BASE_URL}/connect?redirect_uri=https://example.com/callback&state=test&code_challenge=cc&code_challenge_method=S256&client_id=${clientId}`);
        if (res3.ok) {
            console.log('Valid /connect request succeeded (HTML/Ok returned)');
        } else {
            throw new Error(`Expected 200 for valid /connect, got ${res3.status} ${await res3.text()}`);
        }

        console.log('\n--- DCR Smoke Test Passed ---');
    } catch (error: any) {
        console.error('\n--- DCR Smoke Test Failed ---');
        console.error(error.message);
        process.exit(1);
    }
}

testDCR();
