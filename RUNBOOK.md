# RUNBOOK: Operational Procedures

## Table of Contents

1. [Starting/Stopping Services](#startingstopping-services)
2. [Deployment](#deployment)
3. [Database Operations](#database-operations)
4. [Monitoring & Troubleshooting](#monitoring--troubleshooting)
5. [Incident Response](#incident-response)
6. [Backup & Disaster Recovery](#backup--disaster-recovery)

## Starting/Stopping Services

### Start Full Stack (Development)

```bash
npm run dev
```

Starts both frontend and backend concurrently.

### Start Individual Services

```bash
# Frontend only (next.js)
npm run dev:frontend  # http://localhost:3000

# Backend only (fastify)
npm run dev:backend   # http://localhost:3001
```

### Stop Services

```bash
# Ctrl+C in terminal
# Or kill by port:

lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9  # frontend
lsof -i :3001 | grep LISTEN | awk '{print $2}' | xargs kill -9  # backend
```

### Start with Docker

```bash
docker-compose -f docker/compose.yaml up -d

# View logs
docker-compose -f docker/compose.yaml logs -f backend

# Stop
docker-compose -f docker/compose.yaml down
```

## Deployment

### Pre-Deployment Checklist

Before deploying to staging or production:

```bash
# 1. Run all validations
npm run lint              # Code quality
npm run typecheck         # Type safety
npm run test              # Unit tests
npm run test:integration  # Integration tests
npm run e2e               # E2E tests
npm run build             # Production build

# 2. Check all pass
echo "All validations passed!"
```

### Build Production Bundle

```bash
npm run build

# Output in:
# - apps/frontend/.next/
# - apps/backend/dist/
```

### Deploy Frontend (Next.js)

```bash
# Option 1: Vercel (recommended)
npm install -g vercel
vercel deploy

# Option 2: Self-hosted
npm run build --workspace @larcarvalho/frontend
npm run start:frontend
```

### Deploy Backend (Node.js)

```bash
# Local/Docker deployment
npm run build --workspace @larcarvalho/backend
NODE_ENV=production npm run start:backend

# Or Docker
docker build -t larcarvalho-backend:latest .
docker run -d \
  --env-file .env.production \
  -p 3001:3001 \
  larcarvalho-backend:latest
```

### Staging Deployment

```bash
# Set environment
export NODE_ENV=staging
export DATABASE_URL=postgresql://...larcarvalho_staging...

# Deploy
npm run build
npm run start:backend

# Verify health
curl http://localhost:3001/health
```

## Database Operations

### Initialize Database

```bash
# Create database
createdb larcarvalho_development
createdb larcarvalho_test
createdb larcarvalho_staging

# Run migrations
DATABASE_URL=postgresql://user:pass@localhost/larcarvalho_development \
  npm run prisma:migrate:deploy
```

### Run Migrations

```bash
# Development
npm run prisma:migrate:dev

# Staging
DATABASE_URL=postgresql://user:pass@localhost/larcarvalho_staging \
  npm run prisma:migrate:deploy

# Check migration status
npm run prisma:migrate:status
```

### Create Migration

```bash
# After schema changes
npm run prisma:migrate:dev --name=add_column_description

# Review generated SQL
cat apps/backend/prisma/migrations/*/migration.sql
```

### Database Backup

```bash
# Backup
pg_dump larcarvalho_production > backup-$(date +%Y%m%d).sql

# Verify backup
ls -lh backup-*.sql

# Compress
gzip backup-*.sql
```

### Database Restore

```bash
# Restore from backup
psql larcarvalho_production < backup-20260904.sql

# Or with compression
gunzip -c backup-20260904.sql.gz | psql larcarvalho_production

# Verify data
npm run prisma:migrate:status
```

### Reset Database (Development Only)

```bash
# Warning: Deletes all data in development
npm run prisma:migrate:reset

# Confirm when prompted
```

## Monitoring & Troubleshooting

### Check Service Health

```bash
# Backend health
curl -v http://localhost:3001/health

# Response should be 200 OK with:
# { "status": "ok", "database": { "status": "connected" } }
```

### View Logs

```bash
# Development
npm run dev:backend  # Logs to console

# Staging/Production
docker logs -f larcarvalho-backend

# Or from file
tail -f /var/larcarvalho/logs-staging/app.log
```

### Monitor Performance

```bash
# Memory usage
watch -n 1 'ps aux | grep node'

# Network connections
netstat -antp | grep 3001

# Database connections
psql larcarvalho_staging
SELECT count(*) FROM pg_stat_activity;
```

### Port Already in Use

```bash
# Find process using port 3001
lsof -i :3001

# Kill it
kill -9 <PID>

# Or find all node processes
pkill -f "node.*3001"
```

### Database Connection Issues

```bash
# Test connection
psql postgresql://user:pass@localhost:5432/larcarvalho_staging

# If fails, check:
# 1. PostgreSQL is running
pg_isready -h localhost -p 5432

# 2. Database exists
psql -U postgres -l | grep larcarvalho_staging

# 3. User has permissions
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE larcarvalho_staging TO larcarvalho;"
```

## Incident Response

### Application Crash

```bash
# 1. Check status
curl http://localhost:3001/health

# 2. View recent logs
tail -100 /var/larcarvalho/logs-staging/app.log | grep error

# 3. Restart service
docker restart larcarvalho-backend

# 4. Verify recovery
curl http://localhost:3001/ready
```

### High Memory Usage

```bash
# 1. Check memory
ps aux | grep node | grep -v grep

# 2. Check for memory leaks in logs
grep "memory" /var/larcarvalho/logs-staging/app.log

# 3. Restart service
docker restart larcarvalho-backend

# 4. Monitor memory over time
watch -n 5 'ps aux | grep node'
```

### Database Unresponsive

```bash
# 1. Check database
pg_isready

# 2. Try simple query
psql larcarvalho_staging -c "SELECT 1;"

# 3. Check connections
psql larcarvalho_staging -c "SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;"

# 4. Kill long-running queries
psql larcarvalho_staging -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE datname = 'larcarvalho_staging'
  AND query_start < now() - interval '5 minutes';
"
```

### Rate Limiting Issues

```bash
# Check if rate limit middleware is enabled
grep -i "rate" /var/larcarvalho/logs-staging/app.log

# Monitor rate limit hits
grep "rate_limit_exceeded" /var/larcarvalho/logs-staging/app.log | wc -l

# Disable rate limiting temporarily (development only)
# Edit apps/backend/src/config/env.ts
# Set RATE_LIMIT_ENABLED=false in .env
```

## Backup & Disaster Recovery

### Automated Backups

```bash
# Create backup script
cat > /usr/local/bin/backup-larcarvalho.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/larcarvalho"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
pg_dump larcarvalho_production | gzip > $BACKUP_DIR/db-$DATE.sql.gz

# Backup application files
tar -czf $BACKUP_DIR/app-$DATE.tar.gz /var/larcarvalho/

# Clean old backups (older than 30 days)
find $BACKUP_DIR -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR/db-$DATE.sql.gz"
EOF

chmod +x /usr/local/bin/backup-larcarvalho.sh
```

### Schedule Backups (Cron)

```bash
# Backup daily at 2:00 AM
0 2 * * * /usr/local/bin/backup-larcarvalho.sh >> /var/log/backup.log 2>&1

# Edit crontab
crontab -e
```

### Disaster Recovery Test

```bash
# 1. Create test database
createdb larcarvalho_recovery_test

# 2. Restore from backup
gunzip -c /var/backups/larcarvalho/db-20260904_020000.sql.gz | \
  psql larcarvalho_recovery_test

# 3. Verify data integrity
psql larcarvalho_recovery_test -c "SELECT COUNT(*) FROM users;"
psql larcarvalho_recovery_test -c "SELECT COUNT(*) FROM candidates;"

# 4. Run migrations to verify schema
DATABASE_URL=postgresql://user:pass@localhost/larcarvalho_recovery_test \
  npm run prisma:migrate:status

# 5. Clean up
dropdb larcarvalho_recovery_test

# 6. Document results
echo "Backup verified: $(date)" >> /var/log/backup-verification.log
```

### Rollback Procedure

```bash
# If deployment fails:

# 1. Stop current deployment
docker-compose down

# 2. Restore previous version
docker pull larcarvalho-backend:v1.0.0  # Previous version
docker run -d --env-file .env.production \
  larcarvalho-backend:v1.0.0

# 3. Restore database from backup
gunzip -c /var/backups/larcarvalho/db-20260904.sql.gz | \
  psql larcarvalho_production

# 4. Verify system
curl http://localhost:3001/ready

# 5. Alert team
# "Rolled back to v1.0.0 due to deployment issue"
```

## Quick Reference

| Task        | Command                                                  |
| ----------- | -------------------------------------------------------- |
| Start dev   | `npm run dev`                                            |
| Run tests   | `npm run test`                                           |
| Run E2E     | `npm run e2e`                                            |
| Lint code   | `npm run lint`                                           |
| Type check  | `npm run typecheck`                                      |
| Build       | `npm run build`                                          |
| Migrate DB  | `npm run prisma:migrate:deploy`                          |
| View health | `curl http://localhost:3001/health`                      |
| View logs   | `docker logs larcarvalho-backend`                        |
| Backup DB   | `pg_dump larcarvalho_production \| gzip > backup.sql.gz` |
| Restore DB  | `gunzip -c backup.sql.gz \| psql larcarvalho_production` |

---

**Emergency Contacts:**

- On-Call Engineer: See PagerDuty
- Database Admin: DBA-team@larcarvalho.local
- DevOps: DevOps-team@larcarvalho.local

**Escalation:**

1. First responder (15 min)
2. On-call engineer (30 min)
3. Team lead (1 hour)
4. Director (2 hours)
