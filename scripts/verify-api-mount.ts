
import fetch from 'node-fetch';

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`; // Use 3000 for internal container or local dev

async function verify() {
    console.log(`Checking API routes at ${BASE_URL}...`);

    const routes = [
        '/api/config-schema',
        '/config-schema',
        '/api/api-keys',
        '/api-keys'
    ];

    for (const route of routes) {
        try {
            // We use POST for api-keys (expecting 400 or 401 maybe, but 404 is what we care about not being)
            // But config-schema is GET.
            const method = route.includes('api-keys') ? 'POST' : 'GET';
            const res = await fetch(`${BASE_URL}${route}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: method === 'POST' ? '{}' : undefined
            });

            console.log(`${method} ${route} -> ${res.status}`);

            if (res.status !== 404) {
                console.log(`  -> FOUND!`);
            } else {
                console.log(`  -> Not Found.`);
            }
        } catch (e: any) {
            console.log(`${route} -> Error: ${e.message}`);
        }
    }
}

verify();
