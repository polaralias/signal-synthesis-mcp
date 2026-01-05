const API_BASE = './api';

// Parse URL params
const urlParams = new URLSearchParams(window.location.search);
const callbackUrl = urlParams.get('callback_url');
const state = urlParams.get('state');

// Initial Load
async function init() {
    try {
        const res = await fetch(`${API_BASE}/config-status`);
        const status = await res.json();

        // Check for Master Key
        if (status.status === 'missing') {
            document.getElementById('masterKeyAlert').classList.remove('hidden');
            disableInteractions();
        }

        // Check for Master Key
        if (status.status === 'missing') {
            document.getElementById('masterKeyAlert').classList.remove('hidden');
            disableInteractions();
        }

        if (status.mode === 'user_bound') {
            await initUserBoundMode();
        } else {
            // Legacy/Global Mode
            if (callbackUrl) {
                document.getElementById('authModeAlert').classList.remove('hidden');
            }
            await fetchConnections();
            document.getElementById('createForm').addEventListener('submit', createConnectionLegacy);
            document.getElementById('schemaLoading')?.remove();
        }
    } catch (e) {
        console.error('Failed to init', e);
        document.body.innerHTML = '<div class="p-8 text-center text-red-600">Failed to load application configuration.</div>';
    }
}

async function initUserBoundMode() {
    // Modify UI for User Bound Mode
    document.querySelector('h2').textContent = 'Configure API Access';
    document.getElementById('connectionList').parentElement.remove(); // Remove existing connections panel
    document.getElementById('createForm').parentElement.classList.remove('md:grid-cols-2');
    document.getElementById('createForm').parentElement.classList.add('max-w-2xl', 'mx-auto');

    // Clear legacy form fields
    const form = document.getElementById('createForm');
    form.innerHTML = '<div id="schemaLoading" class="text-center py-4">Loading configuration schema...</div>';

    // Fetch Schema
    try {
        const res = await fetch(`${API_BASE}/config-schema`);
        if (!res.ok) throw new Error('Failed to load schema');
        const schema = await res.json();

        renderSchemaForm(form, schema);

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await issueApiKey(form, schema);
        });

    } catch (e) {
        form.innerHTML = `<div class="text-red-500">Error: ${e.message}</div>`;
    }
}

function renderSchemaForm(form, schema) {
    form.innerHTML = '';

    // Add title/description from schema if available
    if (schema.description) {
        const desc = document.createElement('p');
        desc.className = 'text-gray-600 mb-6';
        desc.textContent = schema.description;
        form.appendChild(desc);
    }

    schema.fields.forEach(field => {
        const div = document.createElement('div');
        div.className = 'mb-4';

        const label = document.createElement('label');
        label.className = 'block text-sm font-medium text-gray-700 mb-1';
        label.textContent = field.label + (field.required ? ' *' : '');
        label.htmlFor = field.key;
        div.appendChild(label);

        const input = document.createElement('input');
        input.type = field.secret ? 'password' : 'text';
        input.id = field.key;
        input.name = field.key;
        input.className = 'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-colors outline-none font-mono text-sm';
        if (field.required) input.required = true;

        if (field.help) {
            const help = document.createElement('p');
            help.className = 'mt-1 text-xs text-gray-500';
            help.textContent = field.help;
            div.appendChild(help);
            div.insertBefore(input, help);
        } else {
            div.appendChild(input);
        }

        form.appendChild(div);
    });

    const btn = document.createElement('button');
    btn.type = 'submit';
    btn.className = 'w-full bg-primary hover:bg-secondary text-white font-semibold py-3 px-4 rounded-lg shadow transition-colors duration-200 mt-6';
    btn.textContent = 'Generate API Key';
    form.appendChild(btn);
}

async function issueApiKey(form, schema) {
    const formData = {};
    schema.fields.forEach(field => {
        const val = form.querySelector(`[name="${field.key}"]`).value;
        if (val) formData[field.key] = val;
    });

    try {
        const res = await fetch(`${API_BASE}/api-keys`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: formData })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || err.error || 'Unknown error');
        }

        const result = await res.json(); // { apiKey, message, keyId }

        // Show Modal with Key
        document.getElementById('mcpEndpoint').textContent = new URL('mcp', window.location.href).href;

        const keyDisplay = document.getElementById('tokenDisplay');
        keyDisplay.textContent = result.apiKey;
        keyDisplay.classList.add('font-bold', 'text-lg');

        // Add copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'ml-4 text-sm bg-white border border-blue-200 text-blue-600 px-2 py-1 rounded hover:bg-blue-50';
        copyBtn.textContent = 'Copy';
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(result.apiKey);
            copyBtn.textContent = 'Copied!';
            setTimeout(() => copyBtn.textContent = 'Copy', 2000);
        };
        keyDisplay.parentElement.appendChild(copyBtn);

        // Update modal title/text
        document.querySelector('#sessionModal h2').textContent = 'API Key Generated';
        document.querySelector('#sessionModal p').textContent = result.message;
        document.querySelector('#sessionModal p').classList.add('text-red-600', 'font-medium');

        document.getElementById('sessionModal').classList.remove('hidden');

        form.reset();

    } catch (e) {
        alert('Failed to generate key: ' + e.message);
    }
}

// --- Legacy Logic ---

async function fetchConnections() {
    const listEl = document.getElementById('connectionList');
    if (!listEl) return;
    try {
        const res = await fetch(`${API_BASE}/connections`);
        const connections = await res.json();

        if (connections.length === 0) {
            listEl.innerHTML = '<p class="text-center text-gray-500">No connections found.</p>';
            return;
        }

        const buttonText = callbackUrl ? 'Authorize & Connect' : 'Generate Token';
        const buttonClass = callbackUrl ? 'bg-green-600 hover:bg-green-700' : 'bg-primary hover:bg-secondary';

        listEl.innerHTML = '';
        connections.forEach(c => {
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center p-4 border rounded-lg hover:bg-gray-50 transition-colors';

            const infoDiv = document.createElement('div');

            const nameStrong = document.createElement('strong');
            nameStrong.className = 'text-gray-800 block';
            nameStrong.textContent = c.name; // Safe XSS prevention

            const idSpan = document.createElement('span');
            idSpan.className = 'text-xs text-gray-500 font-mono';
            idSpan.textContent = c.id.substring(0, 8) + '...';

            infoDiv.appendChild(nameStrong);
            infoDiv.appendChild(idSpan);

            const btn = document.createElement('button');
            btn.onclick = () => handleConnect(c.id);
            btn.className = `${buttonClass} text-white text-sm font-semibold py-1.5 px-3 rounded shadow transition-colors`;
            btn.textContent = buttonText;

            div.appendChild(infoDiv);
            div.appendChild(btn);

            listEl.appendChild(div);
        });
    } catch (err) {
        listEl.innerHTML = `<p class="text-red-500 text-center">Error loading connections: ${err.message}</p>`;
    }
}

async function createConnectionLegacy(e) {
    e.preventDefault();

    const alpacaKey = document.getElementById('alpacaKey').value;
    const alpacaSecret = document.getElementById('alpacaSecret').value;
    const polygonKey = document.getElementById('polygonKey').value;

    const data = {
        name: document.getElementById('name').value,
        serverType: 'signal-synthesis-mcp',
        config: {},
        credentials: {}
    };

    if (alpacaKey) data.credentials.ALPACA_API_KEY = alpacaKey;
    if (alpacaSecret) data.credentials.ALPACA_API_SECRET = alpacaSecret;
    if (polygonKey) data.credentials.POLYGON_API_KEY = polygonKey;

    try {
        const res = await fetch(`${API_BASE}/connections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!res.ok) throw new Error(await res.text());

        const connection = await res.json();
        document.getElementById('createForm').reset();
        await fetchConnections(); // Refresh list

        // If in auth mode, automatically proceed to connect
        if (callbackUrl) {
            await handleConnect(connection.id);
        }
    } catch (err) {
        alert('Error creating connection: ' + err.message);
    }
}

async function handleConnect(connectionId) {
    if (callbackUrl) {
        // OAuth-like flow
        try {
            const res = await fetch(`${API_BASE}/authorize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    connectionId,
                    callbackUrl,
                    state
                })
            });

            if (!res.ok) throw new Error(await res.text());

            const { redirectUrl } = await res.json();
            window.location.href = redirectUrl;

        } catch (err) {
            alert('Authorization failed: ' + err.message);
        }
    } else {
        // Manual Token Generation
        try {
            const res = await fetch(`${API_BASE}/connections/${connectionId}/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            if (!res.ok) throw new Error(await res.text());

            const { token } = await res.json();

            const mcpUrl = new URL('mcp', window.location.href);
            document.getElementById('mcpEndpoint').textContent = mcpUrl.href;
            document.getElementById('tokenDisplay').textContent = `Bearer ${token}`;
            document.getElementById('sessionModal').classList.remove('hidden');
        } catch (err) {
            alert('Error creating session: ' + err.message);
        }
    }
}

function disableInteractions() {
    const btn = document.querySelector('button[type="submit"]');
    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        btn.textContent = 'Server Check Failed';
    }
    const inputs = document.querySelectorAll('input');
    inputs.forEach(i => i.disabled = true);

    // Also clear connections list if possible or show error
    const connectionList = document.getElementById('connectionList');
    if (connectionList) {
        connectionList.innerHTML = '<p class="text-center text-gray-500 italic">Server configuration incomplete.</p>';
    }
}

function disableInteractions() {
    const btn = document.querySelector('button[type="submit"]');
    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        btn.textContent = 'Server Check Failed';
    }
    const inputs = document.querySelectorAll('input');
    inputs.forEach(i => i.disabled = true);

    // Also clear connections list if possible or show error
    const connectionList = document.getElementById('connectionList');
    if (connectionList) {
        connectionList.innerHTML = '<p class="text-center text-gray-500 italic">Server configuration incomplete.</p>';
    }
}

// Start
init();
