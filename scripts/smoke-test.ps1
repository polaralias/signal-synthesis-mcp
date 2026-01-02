$BaseUrl = Read-Host "BaseUrl (default: http://localhost:3000)"
if (-not $BaseUrl) { $BaseUrl = "http://localhost:3000" }
$BaseUrl = $BaseUrl.TrimEnd('/')

$Code = Read-Host "Code"
$CodeVerifier = Read-Host "CodeVerifier"
$RedirectUri = Read-Host "RedirectUri (default: http://localhost:3000/callback)"
if (-not $RedirectUri) { $RedirectUri = "http://localhost:3000/callback" }

Write-Host "Step 1: Exchange Code for Token..."
try {
    $tokenBody = @{
        grant_type = "authorization_code"
        code = $Code
        code_verifier = $CodeVerifier
        redirect_uri = $RedirectUri
    }
    # Invoke-RestMethod uses Content-Type application/x-www-form-urlencoded by default for hashtable body
    $tokenResponse = Invoke-RestMethod -Method Post -Uri "$BaseUrl/token" -Body $tokenBody
    $accessToken = $tokenResponse.access_token

    if (-not $accessToken) {
        throw "No access token in response: $($tokenResponse | ConvertTo-Json)"
    }
    Write-Host "Success! Access Token: $accessToken"
} catch {
    Write-Error "Failed to get token: $_"
    exit 1
}

Write-Host "`nStep 2: Call MCP tools/list..."
try {
    $mcpBody = @{
        jsonrpc = "2.0"
        method = "tools/list"
        params = @{}
        id = 1
    } | ConvertTo-Json

    $mcpResponse = Invoke-RestMethod -Method Post -Uri "$BaseUrl/mcp" -Headers @{
        Authorization = "Bearer $accessToken"
    } -Body $mcpBody -ContentType "application/json"

    if ($mcpResponse.error) {
        throw "MCP Error: $($mcpResponse.error | ConvertTo-Json)"
    }

    Write-Host "Success! Tools found:"
    $mcpResponse.result.tools | ForEach-Object { Write-Host "- $($_.name): $($_.description)" }
} catch {
    Write-Error "Failed to call MCP: $_"
    exit 1
}

Write-Host "`nSmoke test complete."
