const http = require('http');

const port = process.env.PORT || 3012;

function checkServer() {
  const options = {
    hostname: 'localhost',
    port: port,
    path: '/mcp',
    method: 'GET',
    headers: {
       'Accept': 'application/json' // Assuming MCP might respond or we just check connectivity
    }
  };

  const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    // A GET to /mcp on Streamable HTTP might return 400 or 404 or a specific MCP error if no payload,
    // but connectivity means the server is up.
    // Actually, Streamable HTTP expects POST usually, or GET with query params for SSE (but we are using the new transport).
    // Let's try a GET to see if it connects. The SDK might return 400 Bad Request if arguments are missing.

    if (res.statusCode >= 200 && res.statusCode < 500) {
        console.log('Smoke test passed: Server is reachable.');
        process.exit(0);
    } else {
        console.error('Smoke test failed: Unexpected status code.');
        process.exit(1);
    }
  });

  req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
    process.exit(1);
  });

  req.end();
}

// Give server time to start if running in parallel, but here we assume it's running.
// If this script is used in a "start & test" command, we might need a delay.
setTimeout(checkServer, 2000);
