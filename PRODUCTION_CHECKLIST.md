# Production Deployment Checklist

Complete this checklist before deploying to production. All items must be verified and marked ✓.

## Pre-Deployment (Week Before)

### Code Quality

- [ ] All tests pass locally: `npm run test`
- [ ] All integration tests pass: `npm run test:integration`
- [ ] E2E tests pass: `npm run e2e`
- [ ] No lint errors: `npm run lint`
- [ ] Type checking passes: `npm run typecheck`
- [ ] No console errors in development
- [ ] Code review completed and approved
- [ ] No hardcoded secrets in code
- [ ] No `console.log` statements (except logging)
- [ ] No `TODO` or `FIXME` comments in critical paths

### Security Review

- [ ] All dependencies up-to-date: `npm audit`
- [ ] No critical CVEs in dependencies
- [ ] HTTPS enforced everywhere
- [ ] CORS configured correctly (not `*`)
- [ ] CSRF protection enabled
- [ ] SQL injection protection verified
- [ ] XSS protection enabled
- [ ] Rate limiting configured
- [ ] Authentication working correctly
- [ ] Authorization (RBAC) enforced
- [ ] Sensitive data redaction in logs enabled
- [ ] Cookie security settings correct
- [ ] Helmet security headers enabled

### Database Readiness

- [ ] Database backups working
- [ ] Backup restoration tested
- [ ] Database connection pooling configured
- [ ] Connection timeout set appropriately
- [ ] Query timeouts configured
- [ ] Indexes optimized for production queries
- [ ] Database size acceptable
- [ ] Database replication tested (if applicable)
- [ ] Database user permissions minimal (principle of least privilege)
- [ ] No test data in production database

### Infrastructure

- [ ] Load balancer configured
- [ ] SSL/TLS certificate valid and not expiring
- [ ] Health check endpoints responding correctly
- [ ] Readiness check endpoints responding correctly
- [ ] Auto-scaling configured (if needed)
- [ ] Monitoring and alerting set up
- [ ] Log aggregation configured
- [ ] Backups configured and tested
- [ ] Disaster recovery plan documented
- [ ] DNS records updated and propagated

### Documentation

- [ ] [STAGING.md](./STAGING.md) complete and reviewed
- [ ] [OBSERVABILITY.md](./OBSERVABILITY.md) complete and reviewed
- [ ] [E2E.md](./E2E.md) complete and reviewed
- [ ] [RUNBOOK.md](./RUNBOOK.md) complete and reviewed
- [ ] API documentation up-to-date
- [ ] Deployment procedures documented
- [ ] Rollback procedures documented
- [ ] Runbook for on-call engineers complete
- [ ] Emergency contacts documented

## 24 Hours Before Deployment

### Final Validation

- [ ] Production environment mirrors staging
- [ ] All configuration values correct
- [ ] Environment variables set correctly
- [ ] Database connection strings verified (not localhost)
- [ ] API endpoints point to correct servers
- [ ] Email addresses configured correctly
- [ ] Payment processing (if applicable) configured
- [ ] Third-party integrations verified
- [ ] CDN/caching configured correctly

### Team Readiness

- [ ] Deployment team briefed
- [ ] On-call engineer assigned
- [ ] Rollback plan reviewed with team
- [ ] Communication channels established (Slack, War Room link, etc.)
- [ ] Stakeholders notified of deployment window
- [ ] Database admin available for emergency
- [ ] DevOps team available for infrastructure issues

### Monitoring Setup

- [ ] Monitoring dashboards prepared
- [ ] Alert thresholds configured
- [ ] Error tracking (e.g., Sentry) configured
- [ ] Performance monitoring active
- [ ] Log aggregation verified
- [ ] Database monitoring enabled
- [ ] Application performance monitoring (APM) configured
- [ ] Incident response procedures ready

## Deployment Day

### Pre-Deployment (2 Hours Before)

- [ ] Current production backup taken and verified
- [ ] Staging environment fully functional
- [ ] Load testing completed successfully
- [ ] Database migration tested on staging
- [ ] Feature flags configured (if using)
- [ ] Canary deployment plan reviewed
- [ ] Deployment script tested in staging environment

### During Deployment

- [ ] Deployment starts on schedule
- [ ] Deployment progress monitored
- [ ] No database migration errors
- [ ] Application starts successfully
- [ ] Health checks passing
- [ ] Readiness checks passing
- [ ] Smoke tests passing
- [ ] E2E tests passing against production
- [ ] No errors in application logs
- [ ] No errors in system logs
- [ ] CPU/Memory usage normal
- [ ] Database connections healthy
- [ ] No alert anomalies

### Post-Deployment (First Hour)

- [ ] All health checks passing: `curl https://api.larcarvalho.com/health`
- [ ] Application responding to requests
- [ ] User login working
- [ ] Public features accessible
- [ ] Admin dashboard functional
- [ ] Database queries executing normally
- [ ] No performance degradation
- [ ] Error rate normal
- [ ] No spike in 5xx errors
- [ ] Rate limiting working correctly
- [ ] Logs being aggregated
- [ ] Monitoring dashboards showing normal metrics

### Post-Deployment (First Day)

- [ ] All critical user paths tested manually
- [ ] Performance baseline met
- [ ] No memory leaks observed
- [ ] Database query performance acceptable
- [ ] Error rate normal
- [ ] No unhandled exceptions in logs
- [ ] RBAC working correctly for all roles
- [ ] Public simulator operational
- [ ] Lead capture working
- [ ] Scheduled jobs running
- [ ] Backups completed successfully
- [ ] Team notified of successful deployment

## Post-Deployment Monitoring (1 Week)

- [ ] Error rate remains normal
- [ ] Performance metrics stable
- [ ] No memory leaks over time
- [ ] Database performance stable
- [ ] User feedback positive
- [ ] No security incidents
- [ ] Backup verification successful
- [ ] Disaster recovery plan tested once

## Rollback Plan (If Issues Occur)

If any critical issue is discovered:

1. **Within First 5 Minutes**
   - [ ] Assess severity
   - [ ] Notify team immediately
   - [ ] Stop deployment if in-progress

2. **Within First 15 Minutes**
   - [ ] Decision to rollback made
   - [ ] Rollback initiated
   - [ ] Database restored from pre-deployment backup
   - [ ] Previous version deployed
   - [ ] Health checks verified
   - [ ] Team notified

3. **Post-Rollback**
   - [ ] System stable
   - [ ] Users can access application
   - [ ] Data integrity verified
   - [ ] Post-incident review scheduled
   - [ ] Root cause analysis documented

## Rollback Verification Checklist

If rollback is executed:

- [ ] Previous version running
- [ ] Health checks passing
- [ ] Database in consistent state
- [ ] No data loss
- [ ] Users can log in
- [ ] Public features working
- [ ] Admin dashboard accessible
- [ ] Error rate normal
- [ ] Performance metrics normal
- [ ] Team notified of rollback

## Post-Incident

- [ ] Root cause analysis completed
- [ ] Preventive measures identified
- [ ] Deploy-blocking issues documented
- [ ] Team training completed
- [ ] Deployment procedure updated
- [ ] Monitoring improved
- [ ] New tests added (if applicable)
- [ ] Communication sent to stakeholders

## Sign-Off

**Deployment Date:** _______________

**Deployed By:** _______________

**Verified By:** _______________

**Team Lead:** _______________ Date: _______________

**Database Admin:** _______________ Date: _______________

**On-Call Engineer:** _______________ Date: _______________

---

## Critical Contacts

| Role             | Name | Phone | Email |
| ---------------- | ---- | ----- | ----- |
| On-Call Engineer |      |       |       |
| Database Admin   |      |       |       |
| DevOps Lead      |      |       |       |
| Team Lead        |      |       |       |
| CTO              |      |       |       |

## Emergency Procedures

### If Application Won't Start

1. SSH to server
2. Check logs: `docker logs larcarvalho-backend`
3. Verify environment variables: `printenv | grep DATABASE`
4. Verify database connectivity: `psql $DATABASE_URL -c "SELECT 1;"`
5. Check disk space: `df -h`
6. Check memory: `free -h`
7. Rollback if unable to fix

### If Database Connection Failing

1. Check PostgreSQL running: `pg_isready`
2. Check connection string: `echo $DATABASE_URL`
3. Check database exists: `psql postgres -l | grep larcarvalho`
4. Check user permissions: `psql -c "\du"`
5. Try direct connection: `psql postgresql://user:pass@host:5432/larcarvalho_production`
6. Restore from backup if corrupted

### If Performance Degraded

1. Check database connections: `psql larcarvalho_production -c "SELECT COUNT(*) FROM pg_stat_activity;"`
2. Check slow queries: `tail -100 /var/larcarvalho/logs/app.log | grep "duration.*ms"`
3. Check CPU/memory: `top`
4. Check network: `netstat -antp | wc -l`
5. Scale up if needed or rollback

## Additional Resources

- [STAGING.md](./STAGING.md) - Staging environment setup
- [OBSERVABILITY.md](./OBSERVABILITY.md) - Monitoring and logging
- [E2E.md](./E2E.md) - End-to-end testing procedures
- [RUNBOOK.md](./RUNBOOK.md) - Operational procedures
- [Deployment Architecture Diagram](./docs/ARCHITECTURE.md)
