
# Smoke Test Script for Financial MCP Server
#
# Steps:
# 1. Open browser to $BaseUrl/connect (e.g., http://localhost:3000/connect)
# 2. Complete the OAuth flow (requires PKCE setup if doing manually, or use a client)
#    Wait, for manual testing, you need to capture the 'code' from the redirect.
#    And you need the 'code_verifier' you generated.
#
# Usage:
#   ./smoke-test.ps1

$BaseUrl = Read-Host "Enter BaseUrl (e.g. http://localhost:3000)"
$Code = Read-Host "Enter Auth Code (from redirect)"
$CodeVerifier = Read-Host "Enter Code Verifier (used to generate challenge)"
$RedirectUri = Read-Host "Enter Redirect URI (used in /connect)"

# 1. Exchange Code for Token
$TokenUrl = "$BaseUrl/token"
$Body = @{
    grant_type = "authorization_code"
    code = $Code
    code_verifier = $CodeVerifier
    redirect_uri = $RedirectUri
} | ConvertTo-Json

Write-Host "Exchanging code for token at $TokenUrl..."
try {
    $TokenResponse = Invoke-RestMethod -Uri $TokenUrl -Method Post -Body $Body -ContentType "application/json"
    $AccessToken = $TokenResponse.access_token
    Write-Host "Success! Access Token received." -ForegroundColor Green
} catch {
    Write-Error "Failed to exchange token. Error: $_"
    exit 1
}

# 2. Call MCP Tools List
$McpUrl = "$BaseUrl/mcp"
$McpBody = @{
    jsonrpc = "2.0"
    id = 1
    method = "tools/list"
} | ConvertTo-Json

Write-Host "Calling MCP tools/list at $McpUrl..."
try {
    $McpResponse = Invoke-RestMethod -Uri $McpUrl -Method Post -Body $McpBody -ContentType "application/json" -Headers @{ "Authorization" = "Bearer $AccessToken" }

    if ($McpResponse.result) {
        Write-Host "Success! MCP Tools list received." -ForegroundColor Green
        $Tools = $McpResponse.result.tools
        Write-Host "Tools found: $($Tools.Count)"
        $Tools | ForEach-Object { Write-Host " - $($_.name): $($_.description)" }
    } else {
        Write-Error "MCP Response did not contain result: $($McpResponse | ConvertTo-Json)"
    }
} catch {
    Write-Error "Failed to call MCP. Error: $_"
    exit 1
}

Write-Host "Smoke test completed successfully." -ForegroundColor Green
