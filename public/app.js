const API_BASE = './api';

// Parse URL params
const urlParams = new URLSearchParams(window.location.search);
const callbackUrl = urlParams.get('callback_url');
const state = urlParams.get('state');

// Auth Mode
if (callbackUrl) {
    document.getElementById('authModeAlert').classList.remove('hidden');
}

async function fetchConnections() {
    const listEl = document.getElementById('connectionList');
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

async function createConnection(e) {
    e.preventDefault();
    
    const alpacaKey = document.getElementById('alpacaKey').value;
    const alpacaSecret = document.getElementById('alpacaSecret').value;
    const polygonKey = document.getElementById('polygonKey').value;

    const data = {
        name: document.getElementById('name').value,
        serverType: 'financial-mcp',
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
            
            document.getElementById('mcpEndpoint').textContent = `${window.location.origin}/mcp`;
            document.getElementById('tokenDisplay').textContent = `Bearer ${token}`;
            document.getElementById('sessionModal').classList.remove('hidden');
        } catch (err) {
            alert('Error creating session: ' + err.message);
        }
    }
}

document.getElementById('createForm').addEventListener('submit', createConnection);
fetchConnections();
