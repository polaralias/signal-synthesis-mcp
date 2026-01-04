import { getConfigMetadata } from '../config-schema';
import { config } from '../config';

export function renderLandingPage(baseUrl: string): string {
    const metadata = getConfigMetadata();

    // Configuration Status Logic
    const hasApiKey = !!config.MCP_API_KEY || !!config.MCP_API_KEYS;
    const hasProviderKeys = !!(
        config.ALPACA_API_KEY ||
        config.POLYGON_API_KEY ||
        config.FMP_API_KEY ||
        config.FINNHUB_API_KEY ||
        config.TWELVE_DATA_API_KEY
    );

    let bannerClass = 'bg-red-100 border-red-400 text-red-700';
    let bannerTitle = 'Action Required';
    let bannerMessage = 'No configuration found. Please set your API keys to enable functionality.';

    if (hasApiKey && hasProviderKeys) {
        bannerClass = 'bg-green-100 border-green-400 text-green-700';
        bannerTitle = 'Configured';
        bannerMessage = 'Server is active and configured. API key authentication and provider links are ready.';
    } else if (hasApiKey || hasProviderKeys) {
        bannerClass = 'bg-yellow-100 border-yellow-400 text-yellow-700';
        bannerTitle = 'Setup Required';
        bannerMessage = 'Server is partially configured. Ensure both MCP_API_KEY and at least one provider key (e.g., Alpaca, Polygon) are set.';
    }

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Signal Synthesis MCP Server</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .glass {
            background: rgba(255, 255, 255, 0.7);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
    </style>
</head>
<body class="bg-gray-50 text-gray-900 font-sans min-h-screen">
    <div class="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <header class="flex items-center space-x-4 mb-12">
            <div class="bg-indigo-600 p-3 rounded-xl shadow-lg">
                <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                </svg>
            </div>
            <div>
                <h1 class="text-4xl font-extrabold tracking-tight text-gray-900">${metadata.name}</h1>
                <p class="text-lg text-gray-500">${metadata.description}</p>
            </div>
        </header>

        <main>
            <!-- Status Banner -->
            <div class="${bannerClass} border-l-4 p-4 mb-8 rounded-r-lg shadow-sm" role="alert">
                <p class="font-bold">${bannerTitle}</p>
                <p>${bannerMessage}</p>
            </div>

            <!-- Links Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <section class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <h2 class="text-xl font-bold mb-4 text-gray-800">Endpoints</h2>
                    <ul class="space-y-3">
                        <li>
                            <a href="${baseUrl}/health" class="text-indigo-600 hover:text-indigo-800 font-medium flex items-center">
                                <span class="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                                /health
                            </a>
                        </li>
                        <li>
                            <a href="${baseUrl}/.well-known/mcp-config" class="text-indigo-600 hover:text-indigo-800 font-medium">/.well-known/mcp-config</a>
                        </li>
                        <li>
                            <a href="${baseUrl}/.well-known/oauth-protected-resource" class="text-indigo-600 hover:text-indigo-800 font-medium">/.well-known/oauth-protected-resource</a>
                        </li>
                        <li>
                            <a href="${baseUrl}/.well-known/oauth-authorization-server" class="text-indigo-600 hover:text-indigo-800 font-medium">/.well-known/oauth-authorization-server</a>
                        </li>
                    </ul>
                </section>

                <section class="bg-indigo-50 p-6 rounded-2xl shadow-sm border border-indigo-100 hover:shadow-md transition-shadow">
                    <h2 class="text-xl font-bold mb-4 text-indigo-900">OAuth / Connect</h2>
                    <p class="text-indigo-700 mb-4 text-sm">Use this interface to manually configure and connect an MCP client using OAuth PKCE flow.</p>
                    <a href="${baseUrl}/connect" class="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-colors">
                        Go to Connect UI
                    </a>
                </section>
            </div>
        </main>

        <footer class="mt-16 text-center text-gray-400 text-sm">
            <p>&copy; 2026 Signal Synthesis MCP Server &bull; Version ${metadata.version}</p>
        </footer>
    </div>
</body>
</html>
  `;
}
