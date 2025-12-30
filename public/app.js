const API_BASE = '/api';

async function fetchConnections() {
    const res = await fetch(`${API_BASE}/connections`);
    const connections = await res.json();
    const list = document.getElementById('connectionList');
    list.innerHTML = '';

    if (connections.length === 0) {
        list.innerHTML = '<p>No connections found.</p>';
        return;
    }

    connections.forEach(conn => {
        const div = document.createElement('div');
        div.className = 'connection-item';
        div.innerHTML = `
            <div>
                <strong>${conn.name}</strong> <small>(${conn.id})</small>
            </div>
            <div>
                <button onclick="createSession('${conn.id}')">Connect</button>
                <button onclick="deleteConnection('${conn.id}')" style="background:#cc0000;">Delete</button>
            </div>
        `;
        list.appendChild(div);
    });
}

async function createConnection(e) {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const alpacaKey = document.getElementById('alpacaKey').value;
    const alpacaSecret = document.getElementById('alpacaSecret').value;
    const polygonKey = document.getElementById('polygonKey').value;

    const credentials = {};
    if (alpacaKey) credentials['ALPACA_API_KEY'] = alpacaKey;
    if (alpacaSecret) credentials['ALPACA_SECRET_KEY'] = alpacaSecret;
    if (polygonKey) credentials['POLYGON_API_KEY'] = polygonKey;

    const payload = {
        name,
        serverType: 'financial-mcp',
        config: { ENABLE_CACHING: true },
        credentials
    };

    try {
        const res = await fetch(`${API_BASE}/connections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            document.getElementById('createForm').reset();
            fetchConnections();
        } else {
            const err = await res.json();
            alert('Error: ' + JSON.stringify(err));
        }
    } catch (e) {
        alert('Failed to create connection');
    }
}

async function createSession(connectionId) {
    try {
        const res = await fetch(`${API_BASE}/connections/${connectionId}/sessions`, {
            method: 'POST'
        });
        const data = await res.json();

        const endpoint = window.location.origin + '/mcp';
        document.getElementById('mcpEndpoint').innerText = endpoint;
        document.getElementById('tokenDisplay').innerText = `Bearer ${data.token}`;
        document.getElementById('sessionModal').style.display = 'block';
    } catch (e) {
        alert('Failed to create session');
    }
}

async function deleteConnection(id) {
    if (!confirm('Are you sure?')) return;
    await fetch(`${API_BASE}/connections/${id}`, { method: 'DELETE' });
    fetchConnections();
}

document.getElementById('createForm').addEventListener('submit', createConnection);
fetchConnections();
