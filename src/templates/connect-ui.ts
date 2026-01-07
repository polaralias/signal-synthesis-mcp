import { getConfigMetadata } from '../config-schema';

export function renderConnectPage(redirectUri: string, state: string, codeChallenge: string, codeChallengeMethod: string, csrfToken: string, clientId: string): string {
    const metadata = getConfigMetadata();
    const fields = metadata.fields;

    const formFields = fields.map(field => `
    <div class="mb-4">
      <label class="block text-sm font-medium text-gray-700 mb-1" for="${field.name}">
        ${field.label}
        ${field.required ? '<span class="text-red-500">*</span>' : ''}
      </label>
      <input
        class="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
        id="${field.name}"
        name="${field.name}"
        type="${field.type === 'password' ? 'password' : 'text'}"
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
            <!-- Hidden Fields for OAuth Flow -->
            <input type="hidden" name="redirect_uri" value="${redirectUri}">
            <input type="hidden" name="state" value="${state}">
            <input type="hidden" name="code_challenge" value="${codeChallenge}">
            <input type="hidden" name="code_challenge_method" value="${codeChallengeMethod}">
            <input type="hidden" name="csrfToken" value="${csrfToken}">
            <input type="hidden" name="client_id" value="${clientId}">

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1" for="displayName">
                    Connection Name
                </label>
                <input
                    class="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                    id="displayName"
                    name="displayName"
                    type="text"
                    placeholder="My Signal Synthesis Connection"
                    required>
            </div>

            <!-- Configuration Fields -->
            ${formFields}

            <div class="pt-4">
                <button
                    class="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-medium transition"
                    type="submit">
                    Connect
                </button>
            </div>
        </form>
    </div>
</body>
</html>
  `;
}
