# Observability: Logging, Metrics, and Monitoring

## Logging Architecture

### Structured Logging

All logs use JSON format for machine-parsing and correlation:

```json
{
  "timestamp": "2026-09-04T20:35:00.123Z",
  "level": "info",
  "service": "backend",
  "requestId": "abc-123-def",
  "message": "User login successful",
  "userId": "user-456",
  "duration": 145,
  "metadata": {
    "email": "user@example.com",
    "role": "ADMIN"
  }
}
```

### Log Levels (Development → Production)

| Level | Development | Test | Staging | Production |
| ----- | ----------- | ---- | ------- | ---------- |
| trace | ✓           | ✗    | ✗       | ✗          |
| debug | ✓           | ✗    | ✗       | ✗          |
| info  | ✓           | ✓    | ✓       | ✓          |
| warn  | ✓           | ✓    | ✓       | ✓          |
| error | ✓           | ✓    | ✓       | ✓          |
| fatal | ✓           | ✓    | ✓       | ✓          |

Configure per environment in `.env*`:

```bash
NODE_ENV=development LOG_LEVEL=debug npm run dev        # Verbose
NODE_ENV=staging     LOG_LEVEL=info  npm run dev        # Production-like
NODE_ENV=production  LOG_LEVEL=warn  npm start          # Errors only
```

### Sensitive Data Redaction

Automatically redact in logs:

- Passwords
- API keys
- Session tokens
- Email addresses (partial)
- Personal ID numbers
- Credit card numbers

Example:

```javascript
// Input
{
  password: "secret123",
  email: "user@example.com",
  apiKey: "sk-12345..."
}

// Output (logged)
{
  password: "***REDACTED***",
  email: "u***@example.com",
  apiKey: "sk-***REDACTED***"
}
```

## Request Correlation

Every request gets a unique ID for tracing through the system:

```
X-Request-ID: abc-123-def-456
```

Appears in:

- Request logs
- Response headers
- Database query logs
- Error stack traces

Trace a request:

```bash
grep "abc-123-def-456" staging.log
```

## Key Metrics

### Request Metrics

```json
{
  "type": "http_request",
  "method": "POST",
  "path": "/api/login",
  "statusCode": 200,
  "duration": 145,
  "timestamp": "2026-09-04T20:35:00Z"
}
```

Track:

- Request count by endpoint
- Response time (p50, p95, p99)
- Error rate (5xx)
- Status code distribution

### Database Metrics

```json
{
  "type": "database_query",
  "query": "SELECT * FROM users WHERE id = $1",
  "duration": 45,
  "timestamp": "2026-09-04T20:35:00Z"
}
```

Alert on:

- Queries >1000ms
- Connection pool exhaustion
- Transaction deadlocks

### Health Metrics

- Server uptime
- Memory usage
- CPU usage
- Database connection count
- Request queue depth

## Accessing Logs

### Development

Logs go to console with pretty-printing:

```bash
npm run dev:backend
```

Output:

```
[2026-09-04 20:35:00] INFO  backend:index.ts:42
Server running on http://0.0.0.0:3001

[2026-09-04 20:35:15] INFO  routes/auth.ts:88
User login successful { userId: "user-456", duration: 145ms }
```

### Staging/Production

Logs written to file:

```bash
tail -f /var/larcarvalho/logs-staging/app.log
```

Or via container logs:

```bash
docker logs -f larcarvalho-backend
```

Filter by level:

```bash
grep '"level":"error"' app.log
```

Filter by request ID:

```bash
grep '"requestId":"abc-123"' app.log
```

## Health Check Endpoints

### `/health` - Liveness Probe

Returns immediately, indicates server is running:

```bash
curl -v http://localhost:3001/health
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2026-09-04T20:35:00Z"
}
```

HTTP 200 = server is alive
HTTP 503 = server is down

### `/ready` - Readiness Probe

Checks dependencies (database, cache), indicates ready to serve:

```bash
curl -v http://localhost:3001/ready
```

Response:

```json
{
  "status": "ready",
  "timestamp": "2026-09-04T20:35:00Z",
  "dependencies": {
    "database": { "status": "connected", "ping": 12 },
    "cache": { "status": "connected", "ping": 1 }
  }
}
```

HTTP 200 = ready to serve
HTTP 503 = dependency down (e.g., database unreachable)

Configure health checks in `docker-compose.yaml`:

```yaml
healthcheck:
  test: ['CMD', 'curl', '-f', 'http://localhost:3001/health']
  interval: 30s
  timeout: 5s
  retries: 3
```

## Monitoring Queries

### Find Slow Endpoints

```bash
grep '"duration":' app.log | jq 'select(.duration > 1000)' | head -20
```

### Find Failed Requests

```bash
grep '"level":"error"' app.log | jq '.message' | sort | uniq -c
```

### Track Login Failures

```bash
grep 'User login failed' app.log | \
  jq '{timestamp, email, reason}' | \
  sort -k2 | uniq -c
```

### Database Performance

```bash
grep '"type":"database_query"' app.log | \
  jq '{query: .query, duration: .duration}' | \
  sort -rn -k2 | head -10
```

### Rate Limit Violations

```bash
grep '"type":"rate_limit_exceeded"' app.log | \
  jq '{endpoint: .path, clientId, timestamp}' | head -20
```

## Alerting Strategy

Configure alerts for:

1. **Critical**
   - Server down (health check failing)
   - Database unreachable
   - Error rate >5%

2. **High**
   - Response time p95 >2s
   - Memory usage >80%
   - Request queue depth >100

3. **Medium**
   - Response time p95 >1s
   - Error rate >1%
   - Slow queries (>1000ms)

4. **Low**
   - Memory usage >60%
   - Warnings in logs
   - Deprecated endpoint usage

## Debugging Tips

### Enable Debug Logging

```bash
LOG_LEVEL=debug NODE_ENV=staging npm run dev:backend
```

### Trace Specific Request

Using request ID from logs:

```bash
REQUEST_ID=abc-123-def npm run dev:backend 2>&1 | grep abc-123-def
```

### Database Query Logging

Enable Prisma query logging:

```bash
DEBUG=prisma:* npm run dev:backend
```

### View Type Coverage

TypeScript compilation logging:

```bash
npm run typecheck -- --listFiles
```

## Production Readiness Validation

- [ ] Logs have unique request IDs
- [ ] Sensitive data is redacted
- [ ] Health checks respond <100ms
- [ ] No debug logs in production config
- [ ] Error logs are actionable (include context)
- [ ] Rate limits are enforced
- [ ] Metrics are collected and queryable

See [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) for full validation.
