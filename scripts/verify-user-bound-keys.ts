
import axios from 'axios';
import { prisma } from '../src/services/database';

const BASE_URL = 'http://localhost:3000';
const MASTER_KEY = '0000000000000000000000000000000000000000000000000000000000000000'; // 32 bytes hex

async function run() {
    console.log('Starting User-Bound API Key Verification...');

    // Prerequisite: Ensure environment is set (this script assumes server is running with these envs)
    // We can't easily change server env from here, so we assume the user/verification run sets it.
    // However, for this script to work, we might need to rely on existing server state or mock it.
    // Given the difficulty of restarting server in this context, we will perform "blackbox" testing 
    // assuming the server is running correctly. 
    // BUT, the server is likely running in the background via `ts-node` or similar. 
    // We might need to restart it to pick up changes. 

    // Check Config Status
    try {
        const statusRes = await axios.get(`${BASE_URL}/api/config-status`);
        console.log('Config Status:', statusRes.data);
        if (statusRes.data.mode !== 'user_bound') {
            console.warn('WARNING: Server is not in user_bound mode. Tests may fail or be skipped.');
            // We might just exit if we can't test
            // return;
        }
    } catch (e) {
        console.error('Failed to reach server. Is it running?', e.message);
        process.exit(1);
    }

    // 1. Issue Key
    console.log('\n1. Issuing API Key...');
    let apiKey = '';
    let keyId = '';

    try {
        const config = {
            ALPACA_API_KEY: 'test_alpaca_key',
            ALPACA_SECRET_KEY: 'test_alpaca_secret'
        };

        const res = await axios.post(`${BASE_URL}/api-keys`, { config });
        apiKey = res.data.apiKey;
        keyId = res.data.keyId;
        console.log('   Success! Key:', apiKey.substring(0, 10) + '...', 'ID:', keyId);
    } catch (e) {
        console.error('   Failed to issue key:', e.response?.data || e.message);
        process.exit(1);
    }

    // 2. Test Auth (Header)
    console.log('\n2. Testing Auth (Validator)...');
    try {
        // We use a simple endpoint or check if we can call a tool (not implemented easily here without MCP client)
        // But /mcp endpoint with just a GET might 404 or something, but 401 is what we want to avoid.
        // Actually /mcp is SSE/POST.
        // Let's call /api-keys/me which requires auth

        const res = await axios.get(`${BASE_URL}/api-keys/me`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        console.log('   Success! Metadata:', res.data);
    } catch (e) {
        console.error('   Failed Auth:', e.response?.data || e.message);
        process.exit(1);
    }

    // 3. Test Invalid Key
    console.log('\n3. Testing Invalid Key...');
    try {
        await axios.get(`${BASE_URL}/api-keys/me`, {
            headers: { 'Authorization': `Bearer invalid_key` }
        });
        console.error('   Failed! Invalid key should have returned 401.');
        process.exit(1);
    } catch (e) {
        if (e.response?.status === 401) {
            console.log('   Success! Got 401 as expected.');
        } else {
            console.error('   Failed! Expected 401, got', e.response?.status);
            process.exit(1);
        }
    }

    // 4. Revoke Key
    console.log('\n4. Revoking Key...');
    try {
        await axios.post(`${BASE_URL}/api-keys/revoke`, {}, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        console.log('   Revoked successfully.');
    } catch (e) {
        console.error('   Failed revocation:', e.response?.data || e.message);
        process.exit(1);
    }

    // 5. Verify Revocation
    console.log('\n5. Verifying Revocation...');
    try {
        await axios.get(`${BASE_URL}/api-keys/me`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        console.error('   Failed! Revoked key still works.');
        process.exit(1);
    } catch (e) {
        if (e.response?.status === 401) {
            console.log('   Success! Revoked key rejected.');
        } else {
            console.error('   Failed! Expected 401 after revocation, got', e.response?.status);
            process.exit(1);
        }
    }

    console.log('\nVerification Complete!');
}

run();
