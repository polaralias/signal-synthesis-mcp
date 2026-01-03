import { getConfigMetadata } from '../config-schema';

export function renderConnectPage(redirectUri: string, state: string, codeChallenge: string, codeChallengeMethod: string, csrfToken: string): string {
  const metadata = getConfigMetadata();
  const fields = metadata.fields;

  const formFields = fields.map(field => `
    <div class="mb-4">
      <label class="block text-gray-700 text-sm font-bold mb-2" for="${field.key}">
        ${field.label}
        ${field.required ? '<span class="text-red-500">*</span>' : ''}
      </label>
      <input
        class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
        id="${field.key}"
        name="${field.key}"
        type="${field.secret ? 'password' : 'text'}"
        ${field.required ? 'required' : ''}
      >
      ${field.help ? `<p class="text-gray-600 text-xs italic mt-1">${field.help}</p>` : ''}
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connect Signal Synthesis MCP Server</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 flex items-center justify-center min-h-screen">
    <div class="bg-white p-8 rounded-2xl shadow-xl w-full max-w-lg border border-gray-100">
        <div class="flex items-center space-x-4 mb-8">
            <div class="bg-indigo-600 p-3 rounded-lg">
                <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                </svg>
            </div>
            <h1 class="text-2xl font-bold text-gray-800">Signal Synthesis MCP Server</h1>
        </div>

        <form action="/connect" method="POST">
            <!-- Hidden Fields for OAuth Flow -->
            <input type="hidden" name="redirect_uri" value="${redirectUri}">
            <input type="hidden" name="state" value="${state}">
            <input type="hidden" name="code_challenge" value="${codeChallenge}">
            <input type="hidden" name="code_challenge_method" value="${codeChallengeMethod}">
            <input type="hidden" name="csrfToken" value="${csrfToken}">

            <!-- Configuration Fields -->
            <div class="mb-6 border-t border-gray-200 pt-4">
                <h2 class="text-lg font-semibold text-gray-700 mb-3">Configuration</h2>
                ${formFields}
            </div>
             <div class="mb-4">
                <label class="block text-gray-700 text-sm font-bold mb-2" for="displayName">
                    Connection Name (Optional)
                </label>
                <input
                    class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    id="displayName"
                    name="displayName"
                    type="text"
                    placeholder="My Financial Server"
                >
            </div>

            <div class="flex items-center justify-between mt-6">
                <button
                    class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full"
                    type="submit">
                    Connect
                </button>
            </div>
             <div class="mt-4 text-center">
                 <a href="${redirectUri}?error=access_denied&state=${state}" class="text-sm text-gray-500 hover:text-gray-800">Cancel</a>
            </div>
        </form>
    </div>
</body>
</html>
  `;
}
