# Smoke Test Script for Dual Auth (OAuth + API Key)
# Usage: ./smoke-auth-test.ps1

$BaseUrl = Read-Host "Enter BaseUrl (e.g. http://localhost:3012, default http://localhost:3012)"
if ([string]::IsNullOrWhiteSpace($BaseUrl)) { $BaseUrl = "http://localhost:3012" }

$ApiKey = Read-Host "Enter valid API Key (MCP_API_KEY)"

$McpUrl = "$BaseUrl/mcp"
$McpBody = @{
    jsonrpc = "2.0"
    id      = 1
    method  = "tools/list"
} | ConvertTo-Json

# --- 1. Test No Auth (Expect 401) ---
Write-Host "`n[Test 1] Testing No Auth..." -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri $McpUrl -Method Post -Body $McpBody -ContentType "application/json"
    Write-Host "FAIL: Unexpectedly succeeded without auth!" -ForegroundColor Red
}
catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "PASS: Received 401 Unauthorized as expected." -ForegroundColor Green
    }
    else {
        Write-Host "FAIL: Expected 401, but got $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    }
}

# --- 2. Test API Key in Header (Expect 200) ---
Write-Host "`n[Test 2] Testing API Key in Header..." -ForegroundColor Cyan
try {
    $Headers = @{ "x-api-key" = $ApiKey }
    $Response = Invoke-RestMethod -Uri $McpUrl -Method Post -Body $McpBody -ContentType "application/json" -Headers $Headers
    Write-Host "PASS: Received 200 OK via Header!" -ForegroundColor Green
    Write-Host "Tools found: $($Response.result.tools.Count)"
}
catch {
    Write-Host "FAIL: API Key in Header failed. Error: $_" -ForegroundColor Red
}

# --- 3. Test API Key in Query Param (Expect 200) ---
Write-Host "`n[Test 3] Testing API Key in Query Param..." -ForegroundColor Cyan
try {
    $QueryUrl = "$McpUrl?apiKey=$ApiKey"
    $Response = Invoke-RestMethod -Uri $QueryUrl -Method Post -Body $McpBody -ContentType "application/json"
    Write-Host "PASS: Received 200 OK via Query Param!" -ForegroundColor Green
    Write-Host "Tools found: $($Response.result.tools.Count)"
}
catch {
    Write-Host "FAIL: API Key in Query Param failed. Error: $_" -ForegroundColor Red
}

# --- 4. Test Invalid API Key (Expect 401) ---
Write-Host "`n[Test 4] Testing Invalid API Key..." -ForegroundColor Cyan
try {
    $Headers = @{ "x-api-key" = "invalid_key_123" }
    Invoke-RestMethod -Uri $McpUrl -Method Post -Body $McpBody -ContentType "application/json" -Headers $Headers
    Write-Host "FAIL: Unexpectedly succeeded with invalid key!" -ForegroundColor Red
}
catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "PASS: Received 401 Unauthorized for invalid key." -ForegroundColor Green
    }
    else {
        Write-Host "FAIL: Expected 401, but got $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    }
}

Write-Host "`nSmoke test for dual auth completed." -ForegroundColor Cyan
