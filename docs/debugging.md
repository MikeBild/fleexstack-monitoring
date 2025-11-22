# Debugging Guide

Comprehensive guide for troubleshooting DigitalOcean Functions issues.

## Debugging Workflow

1. **Check activation status** - Did the function run?
2. **View activation logs** - What happened during execution?
3. **Get activation details** - Full error information
4. **Identify root cause** - Match error to common issues
5. **Apply fix and redeploy**

## Essential Commands

### List Recent Activations

```bash
# All activations
doctl serverless activations list --limit 20

# Filter by status
doctl serverless activations list --limit 20 | grep "application error"
doctl serverless activations list --limit 20 | grep "success"

# Filter by function
doctl serverless activations list --limit 20 | grep analyze-logs
```

### Get Activation Details

```bash
# Get full activation info
doctl serverless activations get <activation-id>

# Get just the response
doctl serverless activations get <activation-id> | jq '.response'

# Get logs
doctl serverless activations get <activation-id> | jq '.logs'
```

### View Logs

```bash
# Last activation logs
doctl serverless activations logs --last

# Follow logs in real-time
doctl serverless activations logs --follow

# Specific activation
doctl serverless activations logs <activation-id>
```

### Invoke for Testing

```bash
# Synchronous (wait for result)
doctl serverless functions invoke monitoring/analyze-logs

# Async (return immediately)
doctl serverless functions invoke monitoring/analyze-logs --no-wait

# Get activation ID for async
doctl serverless functions invoke monitoring/analyze-logs --no-wait | jq -r '.activationId'
```

## Common Issues

### SSL Certificate Error

**Error:**
```
SELF_SIGNED_CERT_IN_CHAIN
self-signed certificate in certificate chain
```

**Cause:** PostgreSQL SSL certificate validation failing

**Solution:** Add to top of function:
```javascript
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
})
```

### Database Connection Failed

**Error:**
```
ECONNREFUSED
Connection refused
```

**Cause:** Database not accessible or wrong credentials

**Solutions:**
1. Verify `DATABASE_URL` is correct
2. Check database firewall allows DO Functions IPs
3. Verify database is running

### GenAI 405 Method Not Allowed

**Error:**
```
{"detail":"Method Not Allowed"}
```

**Cause:** Wrong API endpoint

**Solution:** Use correct endpoint path:
```javascript
const genaiUrl = `${baseUrl}/api/v1/chat/completions`
```

### GenAI 403 Not Authenticated

**Error:**
```
{"detail":"Not authenticated"}
```

**Cause:** Missing or invalid API key

**Solution:** Add Bearer token:
```javascript
const headers = { 'Content-Type': 'application/json' }
if (process.env.GENAI_API_KEY) {
  headers['Authorization'] = `Bearer ${process.env.GENAI_API_KEY}`
}
```

### GenAI 400 Timeout Threshold

**Error:**
```
This non-streaming request exceeds our timeout threshold
```

**Cause:** Response too large without max_tokens

**Solution:** Add max_tokens to request:
```javascript
const requestBody = {
  messages: [...],
  max_tokens: 1000,
}
```

### Database Schema Mismatch

**Error:**
```
null value in column "hostname" violates not-null constraint
```

**Cause:** Missing required fields in INSERT

**Solution:** Add all required fields:
```javascript
// LogEntry needs: hostname
// LogIssue needs: updatedAt, affectedLogs
```

### Function Timeout

**Error:**
```
"timeout": true
```

**Cause:** Function exceeded time limit

**Solutions:**
1. Increase timeout in project.yml (max 120000ms)
2. Optimize database queries
3. Add timeouts to external calls
4. Process data in smaller batches

### Module Not Found

**Error:**
```
Cannot find module 'pg'
```

**Cause:** Dependencies not installed

**Solution:** Ensure package.json lists all dependencies and npm install runs during deploy

### Environment Variable Not Set

**Error:**
```
DATABASE_URL is not defined
```

**Cause:** Environment variable missing

**Solutions:**
1. Check project.yml has the variable
2. Verify .env file has the value
3. Source .env before deploying: `source .env && doctl serverless deploy .`

## Debugging Techniques

### Add Console Logging

```javascript
export async function main(event, context) {
  console.log('[function-name] Started')
  console.log('[function-name] DATABASE_URL:', process.env.DATABASE_URL ? 'set' : 'not set')
  console.log('[function-name] GENAI_API_KEY:', process.env.GENAI_API_KEY ? 'configured' : 'not set')

  // ... your code

  console.log('[function-name] Result:', JSON.stringify(result))
  console.log('[function-name] Completed')
}
```

### Log External API Responses

```javascript
const response = await fetch(url, options)
console.log(`[function-name] API response: ${response.status}`)

if (!response.ok) {
  const errorText = await response.text()
  console.error(`[function-name] API error: ${errorText}`)
}
```

### Check What's Deployed

```bash
# List functions
doctl serverless functions list

# Get function info
doctl serverless functions get monitoring/analyze-logs

# Check version
doctl serverless activations list --limit 5 | awk '{print $4}'
```

### Test API Endpoints

```bash
# Test GenAI endpoint
curl -X POST https://your-agent.agents.do-ai.run/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"messages":[{"role":"user","content":"test"}],"max_tokens":10}'

# Check OpenAPI spec
curl https://your-agent.agents.do-ai.run/openapi.json | jq '.paths | keys'

# Check allowed methods
curl -I -X OPTIONS https://your-agent.agents.do-ai.run
```

### Database Connectivity

```bash
# Test from local machine
psql "postgresql://user:pass@host:25060/db?sslmode=require" -c "SELECT 1"

# Check tables exist
psql "..." -c "\dt"

# Check recent data
psql "..." -c "SELECT COUNT(*) FROM \"LogEntry\" WHERE timestamp > NOW() - INTERVAL '1 hour'"
```

## Activation Status Codes

| Status | Meaning |
|--------|---------|
| `success` | Function completed successfully |
| `application error` | Function threw an error |
| `timeout` | Function exceeded time limit |
| `developer error` | Code syntax/import error |

## Reading Activation Output

```bash
doctl serverless activations get <id> | jq '{
  status: .response.status,
  duration: .duration,
  result: .response.result,
  logs: .logs
}'
```

Key fields:
- `response.status` - success or error type
- `response.result` - return value or error details
- `duration` - execution time in ms
- `logs` - stdout/stderr output

## Performance Debugging

### Slow Function

1. Check duration in activation:
   ```bash
   doctl serverless activations get <id> | jq '.duration'
   ```

2. Add timing logs:
   ```javascript
   const start = Date.now()
   // ... operation
   console.log(`Operation took ${Date.now() - start}ms`)
   ```

3. Common causes:
   - Slow database queries
   - Large data processing
   - External API timeouts

### Memory Issues

- Check memory limit in project.yml
- Reduce batch sizes
- Stream data instead of loading all at once

## Redeployment

After fixing issues:

```bash
# Redeploy single function
doctl serverless deploy . --include "packages/monitoring/analyze-logs"

# Redeploy all
doctl serverless deploy .

# Verify new version
doctl serverless activations list --limit 3 | head -5
```

## Getting Help

### DigitalOcean Resources

- [DO Functions Documentation](https://docs.digitalocean.com/products/functions/)
- [DO Functions CLI Reference](https://docs.digitalocean.com/reference/doctl/reference/serverless/)
- [DO GenAI Documentation](https://docs.digitalocean.com/products/genai-platform/)

### Debug Checklist

- [ ] Activation shows in list?
- [ ] Status is `application error`?
- [ ] Logs show where it failed?
- [ ] Error message clear?
- [ ] Environment variables set?
- [ ] Dependencies installed?
- [ ] Database accessible?
- [ ] External APIs responding?

## See Also

- [Developer Guide](./developers.md) - Implementation details
- [Operator Guide](./operators.md) - Deployment and monitoring
