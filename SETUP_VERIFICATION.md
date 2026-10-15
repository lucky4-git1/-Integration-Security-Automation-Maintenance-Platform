# Setup Verification Guide

This guide walks through verifying that Phase 1 & 2 are working correctly.

## Prerequisites Check

Before starting, ensure you have:
- [x] Node.js 20+ installed: `node --version`
- [x] Docker Desktop running
- [x] Git installed

## Step-by-Step Verification

### 1. Install Dependencies

```powershell
# Install all workspace dependencies
npm install

# Verify installation
npm list --depth=0
```

**Expected:** No errors, all packages installed successfully.

### 2. Configure Environment

```powershell
# Copy environment template
Copy-Item .env.example .env

# Generate secure keys (PowerShell)
$jwt_secret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 64 | ForEach-Object {[char]$_})
$session_secret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 64 | ForEach-Object {[char]$_})
$encryption_key = -join ((0..63) | ForEach-Object {'{0:x}' -f (Get-Random -Maximum 16)})

Write-Host "JWT_SECRET=$jwt_secret"
Write-Host "SESSION_SECRET=$session_secret"
Write-Host "ENCRYPTION_KEY=$encryption_key"
```

**Action:** Update `.env` file with generated secrets.

### 3. Start Infrastructure

```powershell
# Start PostgreSQL and Redis
docker-compose up -d postgres redis

# Check status
docker-compose ps

# View logs
docker-compose logs -f postgres
# Press Ctrl+C to exit logs
```

**Expected:**
- `platform-postgres` - Status: Up (healthy)
- `platform-redis` - Status: Up (healthy)

### 4. Database Setup

```powershell
# Generate Prisma Client
npm run db:generate --workspace=@platform/backend

# Run migrations
npm run db:migrate --workspace=@platform/backend

# Seed system roles
npm run db:seed --workspace=@platform/backend
```

**Expected Output:**
```
🌱 Seeding database...
Creating system roles...
✅ System roles created
🎉 Seeding completed successfully
```

### 5. Verify Database

```powershell
# Open Prisma Studio
npm run db:studio --workspace=@platform/backend
```

**Expected:** Browser opens to Prisma Studio at http://localhost:5555

**Verify:**
- [x] `roles` table contains 5 system roles (owner, admin, operator, security_auditor, viewer)
- [x] All tables are present
- [x] No data in other tables yet

### 6. Build Check

```powershell
# Run TypeScript type checking
npm run typecheck

# Run linter
npm run lint

# Build all packages (optional, takes ~2 min)
npm run build
```

**Expected:** 
- No TypeScript errors
- No linting errors
- Build succeeds (if run)

### 7. Start Development Servers

```powershell
# Open three PowerShell windows/tabs:

# Terminal 1 - Backend
npm run dev:backend

# Terminal 2 - Worker
npm run dev:worker

# Terminal 3 - Frontend
npm run dev:frontend
```

**Expected Output:**

**Backend (Terminal 1):**
```
🚀 API server running on http://localhost:3001
📊 Health check: http://localhost:3001/health
🔧 Environment: development
```

**Worker (Terminal 2):**
```
🔧 Worker service starting...
📦 Queue processing will be implemented in Phase 3
✅ Worker service ready
```

**Frontend (Terminal 3):**
```
VITE vX.X.X  ready in XXX ms

➜  Local:   http://localhost:3000/
➜  Network: use --host to expose
```

### 8. Test Health Endpoint

```powershell
# Test health check
Invoke-RestMethod -Uri "http://localhost:3001/health"
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-XX...",
  "uptime": XXX,
  "database": "connected",
  "redis": "connected"
}
```

### 9. Test Authentication Flow

#### A. Register a User

```powershell
$registerBody = @{
  email = "test@example.com"
  password = "SecurePassword123!"
  firstName = "Test"
  lastName = "User"
} | ConvertTo-Json

$registerResponse = Invoke-RestMethod `
  -Uri "http://localhost:3001/api/v1/auth/register" `
  -Method POST `
  -ContentType "application/json" `
  -Body $registerBody

Write-Host "User registered:" $registerResponse.data.user.email
```

**Expected:**
- Status: 200 OK
- Response contains user object (without password)
- Email: test@example.com

#### B. Login

```powershell
$loginBody = @{
  email = "test@example.com"
  password = "SecurePassword123!"
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod `
  -Uri "http://localhost:3001/api/v1/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body $loginBody

$token = $loginResponse.data.accessToken
Write-Host "Access Token:" $token.Substring(0, 20) "..."
```

**Expected:**
- Status: 200 OK
- Response contains accessToken and refreshToken
- Token is a valid JWT

#### C. Get Current User

```powershell
$headers = @{
  Authorization = "Bearer $token"
}

$meResponse = Invoke-RestMethod `
  -Uri "http://localhost:3001/api/v1/auth/me" `
  -Method GET `
  -Headers $headers

Write-Host "Current user:" $meResponse.data.user.email
```

**Expected:**
- Status: 200 OK
- Response contains user details

### 10. Test Organization Management

#### A. Create Organization

```powershell
$orgBody = @{
  name = "Test Company"
  slug = "test-company"
} | ConvertTo-Json

$orgResponse = Invoke-RestMethod `
  -Uri "http://localhost:3001/api/v1/organizations" `
  -Method POST `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $orgBody

$orgId = $orgResponse.data.organization.id
Write-Host "Organization created:" $orgResponse.data.organization.name
Write-Host "Organization ID:" $orgId
```

**Expected:**
- Status: 201 Created
- Response contains organization with members
- Current user is automatically added as Owner

#### B. List Organizations

```powershell
$orgsResponse = Invoke-RestMethod `
  -Uri "http://localhost:3001/api/v1/organizations" `
  -Method GET `
  -Headers $headers

Write-Host "Organizations count:" $orgsResponse.data.organizations.Count
```

**Expected:**
- Status: 200 OK
- Response contains array with 1 organization

#### C. Get Organization Details

```powershell
$orgDetailResponse = Invoke-RestMethod `
  -Uri "http://localhost:3001/api/v1/organizations/$orgId" `
  -Method GET `
  -Headers $headers

Write-Host "Members count:" $orgDetailResponse.data.organization.members.Count
```

**Expected:**
- Status: 200 OK
- Organization has 1 member (the owner)
- Member has "owner" role

### 11. Test Authorization

#### A. Test Without Token (Should Fail)

```powershell
try {
  Invoke-RestMethod -Uri "http://localhost:3001/api/v1/organizations"
} catch {
  Write-Host "✅ Correctly rejected: Unauthorized"
}
```

**Expected:** 401 Unauthorized error

#### B. Test Cross-Tenant Access (Should Fail)

Register a second user and try to access the first user's organization:

```powershell
# Register second user
$user2Body = @{
  email = "user2@example.com"
  password = "SecurePassword456!"
  firstName = "User"
  lastName = "Two"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "http://localhost:3001/api/v1/auth/register" `
  -Method POST `
  -ContentType "application/json" `
  -Body $user2Body

# Login as second user
$login2Body = @{
  email = "user2@example.com"
  password = "SecurePassword456!"
} | ConvertTo-Json

$login2Response = Invoke-RestMethod `
  -Uri "http://localhost:3001/api/v1/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body $login2Body

$token2 = $login2Response.data.accessToken

# Try to access first user's organization
$headers2 = @{
  Authorization = "Bearer $token2"
}

try {
  Invoke-RestMethod `
    -Uri "http://localhost:3001/api/v1/organizations/$orgId" `
    -Method GET `
    -Headers $headers2
} catch {
  Write-Host "✅ Correctly rejected: Organization not found or access denied"
}
```

**Expected:** 403 Forbidden or 404 Not Found error

### 12. Test Audit Logging

```powershell
$auditHeaders = @{
  Authorization = "Bearer $token"
  "X-Organization-ID" = $orgId
}

$auditResponse = Invoke-RestMethod `
  -Uri "http://localhost:3001/api/v1/audit/logs?limit=10" `
  -Method GET `
  -Headers $auditHeaders

Write-Host "Audit logs count:" $auditResponse.data.logs.Count
$auditResponse.data.logs | ForEach-Object {
  Write-Host "- $($_.action) on $($_.resource) - $($_.result)"
}
```

**Expected:**
- Status: 200 OK
- Audit logs contain:
  - organization.create
  - member.invite (or similar)
- All logs have result: "success"

### 13. Test Frontend

Open browser to http://localhost:3000

**Expected:**
- Page loads successfully
- Shows platform title
- Shows "Phase 1 Complete" status
- No console errors in browser DevTools

### 14. Verify Prisma Studio

Refresh Prisma Studio and verify:

**Users table:**
- [x] 2 users exist (test@example.com, user2@example.com)
- [x] Passwords are hashed (not plaintext)
- [x] lastLoginAt is set

**Organizations table:**
- [x] 1 organization exists (Test Company)

**OrganizationMembers table:**
- [x] 1 membership exists
- [x] Links user to organization with owner role

**Sessions table:**
- [x] Active sessions exist for logged-in users

**AuditLogs table:**
- [x] Multiple audit entries exist
- [x] Entries have organizationId, userId, action, resource, result

## Verification Checklist

After completing all steps, verify:

- [x] Docker services running (PostgreSQL, Redis)
- [x] Database migrated and seeded
- [x] Backend API responding on port 3001
- [x] Worker service running
- [x] Frontend serving on port 3000
- [x] User registration works
- [x] User login returns valid JWT
- [x] Organization creation works
- [x] Authorization blocks unauthorized access
- [x] Tenant isolation prevents cross-org access
- [x] Audit logs capture all operations
- [x] Health check returns healthy status

## Common Issues

### Issue: Port Already in Use

**Solution:**
```powershell
# Find process using port
netstat -ano | findstr :3001

# Kill process by PID
taskkill /PID <PID> /F

# Or change port in .env
```

### Issue: Database Connection Failed

**Solution:**
```powershell
# Restart PostgreSQL
docker-compose restart postgres

# Check logs
docker-compose logs postgres

# Verify DATABASE_URL in .env matches docker-compose.yml
```

### Issue: Prisma Client Not Generated

**Solution:**
```powershell
npm run db:generate --workspace=@platform/backend
```

### Issue: Migration Failed

**Solution:**
```powershell
# Reset database (CAUTION: deletes all data)
npm run db:reset --workspace=@platform/backend

# Re-run seed
npm run db:seed --workspace=@platform/backend
```

## Next Steps After Verification

Once everything is verified:

1. ✅ Commit the working baseline
2. ✅ Create a git tag: `v0.1.0-phase1-complete`
3. ✅ Begin Phase 3 implementation
4. ✅ Implement integration provider adapters
5. ✅ Build automation scheduling system

## Success Criteria

Phase 1 & 2 are successfully verified when:
- All services start without errors
- User can register and login
- User can create organization
- Authorization prevents unauthorized access
- Audit logs record all actions
- Database schema is complete
- No TypeScript or linting errors

---

**Congratulations! Phase 1 & 2 are complete and verified! 🎉**

Proceed to Phase 3: Integration Management System
