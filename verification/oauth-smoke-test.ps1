# OAuth Smoke Test for Signal Synthesis MCP
$BaseUrl = "http://localhost:3012"
$ErrorActionPreference = "Stop"

function Test-Endpoint {
    param($Name, $ScriptBlock)
    Write-Host "TEST: $Name" -NoNewline
    try {
        & $ScriptBlock
        Write-Host " [PASS]" -ForegroundColor Green
    }
    catch {
        Write-Host " [FAIL]" -ForegroundColor Red
        Write-Host "Error: $_"
        exit 1
    }
}

# 1. Check Well-Known Configuration
Test-Endpoint "Metadata Check" {
    $meta = Invoke-RestMethod -Uri "$BaseUrl/.well-known/oauth-authorization-server"
    if (-not $meta.issuer.StartsWith("http")) { throw "Issuer not absolute URL" }
    if (-not $meta.authorization_endpoint.StartsWith("http")) { throw "Auth endpoint not absolute URL" }
    if (-not $meta.token_endpoint.StartsWith("http")) { throw "Token endpoint not absolute URL" }
    if (-not $meta.registration_endpoint.StartsWith("http")) { throw "Registration endpoint not absolute URL" }
}

# 2. Register with Allowed URI (localhost prefix is allowed by default)
Test-Endpoint "DCR Register Allowed" {
    $body = @{
        redirect_uris = @("http://localhost:3000/callback")
        client_name   = "SmokeTestClient"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$BaseUrl/register" -Method Post -Body $body -ContentType "application/json"
    if (-not $response.client_id) { throw "No client_id returned" }
}

# 3. Register with Disallowed URI
Test-Endpoint "DCR Register Disallowed" {
    $body = @{
        redirect_uris = @("http://evil.com/callback")
        client_name   = "EvilClient"
    } | ConvertTo-Json

    try {
        Invoke-RestMethod -Uri "$BaseUrl/register" -Method Post -Body $body -ContentType "application/json"
        throw "Should have failed but succeeded"
    }
    catch {
        # Check specific error message
        $err = $_.Exception.Response.GetResponseStream()
        $reader = [System.IO.StreamReader]::new($err)
        $respBody = $reader.ReadToEnd() | ConvertFrom-Json
        
        if ($respBody.error -ne "invalid_redirect_uri") { 
            throw "Wrong error code: $($respBody.error)" 
        }
        if ($respBody.error_description -ne "This client isn't in the redirect allow list - raise an issue on GitHub for it to be added") {
            throw "Wrong error message: $($respBody.error_description)"
        }
    }
}

Write-Host "`nAll OAuth Smoke Tests Passed!" -ForegroundColor Cyan
