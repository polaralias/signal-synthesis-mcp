# Financial MCP Server Smoke Test
# Usage: ./smoke-test.ps1

Write-Host "Financial MCP Server Smoke Test" -ForegroundColor Cyan
Write-Host "==============================="

# 1. Gather Inputs
$BaseUrl = Read-Host "Enter Server Base URL (e.g., http://localhost:3000)"
if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
    $BaseUrl = "http://localhost:3000"
    Write-Host "Using default: $BaseUrl" -ForegroundColor Gray
}

Write-Host "`n[Action Required] Go to your browser and complete the connection flow:"
Write-Host "  $BaseUrl/connect?redirect_uri=$BaseUrl/callback&state=test&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGk_8skphU&code_challenge_method=S256"
Write-Host "  (Using pre-calculated challenge for verifier: 'test-verifier-123456789012345678901234567890')"
Write-Host "`nAfter redirect, copy the 'code' parameter from the URL."

$Code = Read-Host "Enter Authorization Code"
$CodeVerifier = "test-verifier-123456789012345678901234567890"
$ManualVerifier = Read-Host "Enter Code Verifier (Press Enter to use default: '$CodeVerifier')"
if (![string]::IsNullOrWhiteSpace($ManualVerifier)) {
    $CodeVerifier = $ManualVerifier
}
$RedirectUri = Read-Host "Enter Redirect URI used (Press Enter to use default: '$BaseUrl/callback')"
if ([string]::IsNullOrWhiteSpace($RedirectUri)) {
    $RedirectUri = "$BaseUrl/callback"
}

# 2. Exchange Code for Token
Write-Host "`n[Step 1] Exchanging code for token..." -ForegroundColor Yellow

try {
    $TokenBody = @{
        grant_type    = "authorization_code"
        code          = $Code
        code_verifier = $CodeVerifier
        redirect_uri  = $RedirectUri
    } | ConvertTo-Json

    $TokenResponse = Invoke-RestMethod -Uri "$BaseUrl/token" -Method Post -Body $TokenBody -ContentType "application/json"

    if ($TokenResponse.access_token) {
        $AccessToken = $TokenResponse.access_token
        Write-Host "Success! Access Token received." -ForegroundColor Green
        # Write-Host "Token: $AccessToken" -ForegroundColor DarkGray
    } else {
        Write-Error "Failed to get access token. Response: $($TokenResponse | ConvertTo-Json)"
        exit 1
    }
}
catch {
    Write-Error "Error during token exchange: $_"
    exit 1
}

# 3. Call MCP Endpoint (List Tools)
Write-Host "`n[Step 2] Testing MCP Endpoint (List Tools)..." -ForegroundColor Yellow

try {
    $McpBody = @{
        jsonrpc = "2.0"
        method  = "tools/list"
        id      = 1
    } | ConvertTo-Json

    $McpResponse = Invoke-RestMethod -Uri "$BaseUrl/mcp" -Method Post -Body $McpBody -ContentType "application/json" -Headers @{ "Authorization" = "Bearer $AccessToken" }

    if ($McpResponse.result -and $McpResponse.result.tools) {
        $ToolCount = $McpResponse.result.tools.Count
        Write-Host "Success! Retrieved $ToolCount tools." -ForegroundColor Green
        foreach ($tool in $McpResponse.result.tools) {
            Write-Host " - $($tool.name): $($tool.description)" -ForegroundColor Gray
        }
    } else {
        Write-Error "Failed to list tools. Response: $($McpResponse | ConvertTo-Json)"
        exit 1
    }

}
catch {
    Write-Error "Error calling MCP endpoint: $_"
    exit 1
}

Write-Host "`nSmoke Test Passed!" -ForegroundColor Green
