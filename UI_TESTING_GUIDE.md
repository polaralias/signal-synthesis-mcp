# UI Testing Guide - ClickUp-Style Implementation

This guide helps verify the new ClickUp-style UI implementation for Signal Synthesis MCP.

## Prerequisites

1. **Set MASTER_KEY** - Required for encryption/decryption:
   ```bash
   export MASTER_KEY=$(openssl rand -hex 32)
   ```

2. **Database** - Ensure PostgreSQL is running or configure DATABASE_URL

3. **Start Server**:
   ```bash
   npm run build
   export PORT=3000
   npm start
   ```

## Test Scenarios

### 1. Dashboard View (/)

**Expected Behavior:**
- Gray background with centered white card
- Title: "Signal Synthesis MCP Server"
- Config status banner appears (green if MASTER_KEY is set, red if not)
- "Connections" heading with "New Connection" button
- Empty state message if no connections exist

**Visual Check:**
- Matches ClickUp card layout style
- Tailwind classes applied correctly
- Banner shows appropriate color (green/red)

### 2. Config Status Banner

**Test Missing MASTER_KEY:**
```bash
unset MASTER_KEY
npm start
```

**Expected:**
- Red banner with ❌ icon
- Title: "Server not configured: MASTER_KEY missing"
- Guidance section with setup instructions for local and Docker

**Test With MASTER_KEY:**
```bash
export MASTER_KEY=$(openssl rand -hex 32)
npm start
```

**Expected:**
- Green banner with ✅ icon
- Title: "Configured"
- Message: "Master key is present"

### 3. Create Connection Flow

**Steps:**
1. Click "New Connection" button
2. Verify form displays with:
   - Connection Name field
   - API Key fields (Alpaca, Polygon, FMP, Finnhub, Twelve Data)
   - "Connect" button (green)
   - "Cancel" button

3. Fill in connection name and at least one API key
4. Click "Connect"

**API Request:**
```bash
curl -X POST http://localhost:3000/api/connections \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Connection",
    "config": {
      "ALPACA_API_KEY": "test_key",
      "ALPACA_SECRET_KEY": "test_secret"
    }
  }'
```

**Expected Response:**
```json
{
  "id": "uuid-here",
  "name": "Test Connection"
}

```

**UI Expected:**
- Form closes
- Returns to dashboard
- New connection appears in list

### 4. Connection List

**Expected Display:**
- Each connection shows as a white card with hover effect
- Connection name in bold
- ID in small gray text
- "Manage" button (blue)
- "Delete" button (red)

### 5. Connection Detail View

**Steps:**
1. Click "Manage" on a connection
2. Verify detail view shows:
   - Back button (←)
   - Connection name
   - Connection ID
   - Config fields (with secrets redacted)
   - Created date
   - "Generate New Session Token" button
   - "Active Sessions" section

**API Test:**
```bash
curl http://localhost:3000/api/connections/{connection-id}
```

**Expected Response:**
```json
{
  "id": "uuid",
  "name": "Test Connection",
  "displayName": "Test Connection",
  "createdAt": "2026-01-07T...",
  "config": {
    "ALPACA_API_KEY": "***REDACTED***",
    "ALPACA_SECRET_KEY": "***REDACTED***"
  }
}
```

### 6. Session Token Generation

**Steps:**
1. In connection detail view, click "Generate New Session Token"
2. Verify session output appears:
   - Yellow banner with session token
   - Copy button
   - Usage hint: "Authorization: Bearer <token>"

**API Test:**
```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"connectionId": "uuid-here"}'
```

**Expected Response:**
```json
{
  "accessToken": "token-here"
}
```

### 7. Sessions List

**Expected Display:**
- Each session shows:
  - Truncated ID (first 8 chars + "...")
  - Status badge (Active=green, Expired/Revoked=gray)
  - Expiration date
  - "Revoke" button (if not revoked)

**API Test:**
```bash
curl http://localhost:3000/api/connections/{connection-id}/sessions
```

**Expected Response:**
```json
[
  {
    "id": "session-uuid",
    "expiresAt": "2026-01-07T...",
    "revoked": false,
    "revokedAt": null,
    "createdAt": "2026-01-07T..."
  }
]
```

### 8. Session Revocation

**Steps:**
1. Click "Revoke" on an active session
2. Confirm dialog
3. Verify status changes to "Revoked"
4. "Revoke" button disappears

**API Test:**
```bash
curl -X POST http://localhost:3000/api/sessions/{session-id}/revoke
```

### 9. Delete Connection

**Steps:**
1. From dashboard, click "Delete" on a connection
2. Confirm dialog
3. Verify connection disappears from list

**API Test:**
```bash
curl -X DELETE http://localhost:3000/api/connections/{connection-id}
```

### 10. OAuth Connect UI (/connect)

**Access with PKCE Parameters:**
```
http://localhost:3000/connect?client_id=test-client&redirect_uri=http://localhost:8080/callback&state=random-state&code_challenge=challenge-here&code_challenge_method=S256
```

**Expected:**
- Centered white card on gray background
- Title: "Signal Synthesis MCP Server"
- Subtitle: "Configure your connection"
- Connection Name field
- API key fields for all providers
- Hidden fields preserved (client_id, redirect_uri, etc.)
- "Connect" button (blue, full width)
- "Cancel" link

**Visual Check:**
- Matches ClickUp connect.html styling
- All Tailwind classes applied
- Form submits via POST to /connect (urlencoded)

### 11. User-Bound API Key Flow

**Prerequisites:**
```bash
export API_KEY_MODE=user_bound
npm start
```

**Steps:**
1. Navigate to /
2. Verify user-bound form appears instead of dashboard
3. Form shows dynamic fields from config-schema
4. Fill and submit
5. API key displays with copy button

**Note:** This requires /api/config-schema endpoint to return 200

### 12. Visual Consistency Checklist

Compare with ClickUp reference:

- [ ] Same card layout (centered, rounded corners, shadow)
- [ ] Same color scheme (blue buttons, gray backgrounds)
- [ ] Same typography (font sizes, weights)
- [ ] Same spacing (padding, margins)
- [ ] Same form field styles (borders, focus rings)
- [ ] Same button styles (colors, hover effects)
- [ ] Same status indicators (green/red/gray)

## API Endpoints Summary

### New Endpoints
- `POST /api/sessions` - Create session (returns accessToken)
- `GET /api/connections/:id` - Get connection with sanitized config
- `GET /api/connections/:id/sessions` - List sessions for connection
- `POST /api/sessions/:id/revoke` - Revoke session
- `DELETE /api/connections/:id` - Delete connection

### Updated Endpoints
- `POST /api/connections` - Now accepts both `{name, credentials}` and `{name, config}`

### Existing Endpoints (Unchanged)
- `GET /api/config-status` - Config status for banner
- `GET /api/connections` - List all connections
- `POST /api/connections/:id/sessions` - Create session (returns token)

## Troubleshooting

### Banner not showing
- Check `/api/config-status` returns proper JSON
- Verify MASTER_KEY is set

### Connections not loading
- Check database connection
- Verify `/api/connections` endpoint works
- Check browser console for errors

### Session generation fails
- Ensure MASTER_KEY is set
- Verify connection exists
- Check server logs for errors

### Styling issues
- Verify Tailwind CDN loads (check browser network tab)
- Check for console errors
- Compare with ClickUp reference screenshots

## Success Criteria

✅ All views match ClickUp visual design
✅ All API endpoints return expected data
✅ No breaking changes to existing functionality
✅ Secrets properly redacted in UI
✅ Sessions can be created and revoked
✅ OAuth connect flow preserves CSRF protection
