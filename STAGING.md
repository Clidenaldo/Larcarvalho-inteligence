# Staging Environment Configuration

## Overview

The staging environment mirrors production as closely as possible without using real customer data. It serves as the final validation before production deployment.

## Environment Setup

### 1. Environment Variables

Copy `.env.staging.example` to `.env.staging` and configure:

```bash
cp .env.staging.example .env.staging
```

Key staging-specific settings:

- **LOG_LEVEL=info**: Reduced verbosity vs development (debug)
- **NODE_ENV=staging**: Enables staging-only middleware
- **DATABASE_URL**: Use separate `larcarvalho_staging` database
- **COOKIE_SECURE=true**: HTTPS-only cookies
- **CORS_ORIGIN**: Restrict to staging domain

### 2. Database Separation

- **Development**: `larcarvalho_development`
- **Test**: `larcarvalho_test` (auto-wiped per test run)
- **Staging**: `larcarvalho_staging` (persistent, non-production data)
- **Production**: `larcarvalho_production` (PROD, never touch in staging)

Run migrations on staging database:

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/larcarvalho_staging npm run prisma:migrate:deploy
```

### 3. Health Checks

Staging includes health and readiness endpoints for load balancer configuration:

```bash
curl http://localhost:3001/health       # Server health
curl http://localhost:3001/ready        # Ready to serve requests
```

Both return:

```json
{
  "status": "ok",
  "timestamp": "2026-09-04T20:30:00Z",
  "database": { "status": "connected" }
}
```

## Running Staging Environment

### Full Stack

```bash
NODE_ENV=staging npm run dev
```

Starts:

- Frontend: http://localhost:3000
- Backend: http://localhost:3001
- Database: PostgreSQL on localhost:5432

### Individual Services

```bash
# Frontend only
npm run dev:frontend

# Backend only (requires database running)
npm run dev:backend
```

## Testing in Staging

### E2E Tests

Run Playwright test suite against staging:

```bash
PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000 npm run e2e
```

Monitor test reports:

```bash
npm run e2e:report
```

### Manual Testing Scenarios

1. **Authentication Flow**
   - Admin login with test credentials
   - Session persistence across page reloads
   - Logout clears session

2. **Public Features**
   - Candidate simulator accessible without login
   - Lead capture form submits successfully
   - Rate limits enforce after N requests

3. **RBAC Validation**
   - Admin user sees admin panel
   - Unauthorized users denied access
   - Public routes don't require auth

4. **Error Handling**
   - Malformed requests return 400
   - Missing auth returns 401
   - Insufficient permissions return 403

## Performance Baseline

Staging collects metrics (disabled in development):

```bash
curl http://localhost:3001/metrics
```

Expected response times:

- Health check: <100ms
- API endpoints: <500ms
- Database queries: <1s

## Rate Limiting

Staging enforces production rate limits:

- Login attempts: 5 per minute
- Public simulator: 30 per 10 minutes
- Lead capture: 10 per 10 minutes

Test by: `curl http://localhost:3001/api/public/simulate` repeatedly

## Backup & Restore

Test disaster recovery procedure:

```bash
# Backup staging database
pg_dump larcarvalho_staging > staging-backup.sql

# Restore from backup
psql larcarvalho_staging < staging-backup.sql
```

Verify data integrity after restore:

```bash
npm run prisma:migrate:status
```

## Monitoring

Enable structured logging in staging:

```bash
LOG_LEVEL=info NODE_ENV=staging npm run dev:backend 2>&1 | tee staging.log
```

Watch for:

- Slow queries (>1s)
- Failed authentication attempts
- Rate limit violations
- Database connection errors

## Troubleshooting

### Port 3000/3001 Already in Use

```bash
# Find and kill process
lsof -i :3000  # or :3001
kill -9 <PID>
```

### Database Connection Refused

```bash
# Check PostgreSQL is running
pg_isready

# Verify connection string in .env.staging
# Format: postgresql://user:password@host:5432/larcarvalho_staging
```

### Health Check Failing

```bash
# 1. Check database connectivity
npm run prisma:migrate:status

# 2. Verify environment variables
npm run typecheck

# 3. Review logs for errors
```

## Pre-Production Validation

Before deploying to production, verify:

- [ ] All E2E tests pass (`npm run e2e`)
- [ ] Health checks respond 200 OK
- [ ] No console errors in backend/frontend logs
- [ ] Rate limits working correctly
- [ ] Backup/restore procedure tested
- [ ] Load test completes without errors
- [ ] RBAC enforced correctly for all roles

See [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) for full deployment checklist.
