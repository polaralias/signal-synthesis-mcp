import { getConfigMetadata } from '../config-schema';

export function renderConnectPage(redirectUri: string, state: string, codeChallenge: string, codeChallengeMethod: string, csrfToken: string, clientId: string): string {
    const metadata = getConfigMetadata();
    const fields = metadata.fields;

    const formFields = fields.map(field => `
        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">${field.label}${field.required ? ' <span class="text-red-500">*</span>' : ''}</label>
            <input
                type="${field.type === 'password' ? 'password' : 'text'}"
                id="${field.name}"
                name="${field.name}"
                class="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="${field.label}"
                ${field.required ? 'required' : ''}
            >
        </div>
    `).join('');

    return `
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connect Signal Synthesis MCP</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>

<body class="bg-gray-100 min-h-screen flex items-center justify-center p-4">
    <div class="bg-white rounded-lg shadow-lg max-w-lg w-full p-8">
        <h1 class="text-2xl font-bold text-gray-800 mb-2 text-center">Signal Synthesis MCP Server</h1>
        <p class="text-gray-600 text-center mb-6">Configure your connection</p>

        <form action="/connect" method="POST" class="space-y-4">
            <!-- Hidden PKCE and Client fields -->
            <input type="hidden" name="client_id" value="${clientId}">
            <input type="hidden" name="redirect_uri" value="${redirectUri}">
            <input type="hidden" name="state" value="${state}">
            <input type="hidden" name="code_challenge" value="${codeChallenge}">
            <input type="hidden" name="code_challenge_method" value="${codeChallengeMethod}">
            <!-- CSRF Token -->
            <input type="hidden" name="csrfToken" value="${csrfToken}">

            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Connection Name</label>
                <input type="text" name="displayName"
                    class="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="My Signal Synthesis Connection">
            </div>

            ${formFields}

            <div class="pt-4">
                <button type="submit"
                    class="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-medium transition">
                    Connect
                </button>
            </div>
        </form>
        
        <div class="mt-4 text-center">
            <a href="${redirectUri}?error=access_denied&state=${state}" class="text-sm text-gray-500 hover:text-gray-800">Cancel</a>
        </div>
    </div>
</body>

</html>
  `;
}
