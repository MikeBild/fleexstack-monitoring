# Operator Guide

Deployment, monitoring, and maintenance of the FleexStack monitoring system.

## Deployment

### GitHub Actions (Recommended)

Functions auto-deploy on push to main branch. The workflow requires these secrets:

**Secrets** (sensitive):
- `DO_API_TOKEN` - DigitalOcean API token
- `DATABASE_URL` - PostgreSQL connection string
- `GENAI_API_KEY` - DO GenAI API key
- `GH_TOKEN` - GitHub token for alerts

**Variables** (non-sensitive):
- `GENAI_AGENT_URL` - GenAI agent URL
- `BLUE_HOST` - Blue node IP
- `GREEN_HOST` - Green node IP
- `ALERTS_REPO` - GitHub repo for alerts

### Manual Deployment

```bash
# Connect to namespace
doctl serverless connect fleexstack-monitoring

# Deploy all functions
source .env
doctl serverless deploy .

# Deploy specific function
doctl serverless deploy . --include "packages/monitoring/analyze-logs"
```

### Clean Deployment

If you need to reset the namespace:

```bash
# Delete existing namespace
doctl serverless namespaces delete fleexstack-monitoring --force

# Create fresh namespace
doctl serverless namespaces create --label fleexstack-monitoring --region fra1

# Connect and deploy
doctl serverless connect fleexstack-monitoring
doctl serverless deploy .
```

## Environment Variables

### Setting Variables

Via DO Console:
1. Go to Functions → fleexstack-monitoring
2. Click "Environment Variables"
3. Add/update variables

Via CLI:
```bash
# Variables are passed during deployment via project.yml
# They're read from shell environment during `doctl serverless deploy`
source .env
doctl serverless deploy .
```

### Required Variables

| Variable | Example | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://user:pass@host:25060/db?sslmode=require` | PostgreSQL connection |
| `BLUE_HOST` | `209.38.248.218` | Blue node IP |
| `GREEN_HOST` | `209.38.209.155` | Green node IP |

### Optional Variables

| Variable | Example | Description |
|----------|---------|-------------|
| `GENAI_AGENT_URL` | `https://xxx.agents.do-ai.run` | GenAI agent base URL |
| `GENAI_API_KEY` | `GuWR12W0EKX...` | GenAI Bearer token |
| `ALERTS_REPO` | `org/repo` | GitHub repo for issue alerts |
| `GH_TOKEN` | `gho_xxx` | GitHub token |
| `LOG_RETENTION_DAYS` | `30` | Days to keep logs |

## Monitoring Functions

### Check Function Status

```bash
# List all functions
doctl serverless functions list

# Get function details
doctl serverless functions get monitoring/analyze-logs
```

### View Activations

```bash
# List recent activations
doctl serverless activations list --limit 20

# Filter by function
doctl serverless activations list --limit 10 | grep analyze-logs

# Get activation details
doctl serverless activations get <activation-id>

# View logs
doctl serverless activations logs --last
```

### Monitor in Real-Time

```bash
# Follow activation logs
doctl serverless activations logs --follow
```

## Common Operations

### Invoke Functions Manually

```bash
# Synchronous (waits for result)
doctl serverless functions invoke monitoring/collect-logs

# Asynchronous (returns immediately)
doctl serverless functions invoke monitoring/analyze-logs --no-wait

# With parameters
doctl serverless functions invoke monitoring/cleanup-data -p days:7
```

### Check Scheduler

The scheduler runs every minute and triggers other functions:

```bash
# View scheduler activations
doctl serverless activations list --limit 20 | grep scheduler
```

### Query Monitoring Data

```sql
-- Function activity (check if functions are running)
SELECT source, COUNT(*), MAX("detectedAt") as last_run
FROM "LogIssue"
GROUP BY source;

-- Log collection stats
SELECT
  DATE_TRUNC('hour', timestamp) as hour,
  source,
  COUNT(*) as logs
FROM "LogEntry"
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY hour, source
ORDER BY hour DESC;

-- Error rate trend
SELECT
  DATE_TRUNC('hour', timestamp) as hour,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE level IN ('error', 'fatal')) as errors,
  ROUND(100.0 * COUNT(*) FILTER (WHERE level IN ('error', 'fatal')) / NULLIF(COUNT(*), 0), 2) as error_rate
FROM "LogEntry"
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;

-- Open issues by severity
SELECT severity, COUNT(*)
FROM "LogIssue"
WHERE status = 'open'
GROUP BY severity
ORDER BY
  CASE severity
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    ELSE 4
  END;
```

## Maintenance

### Data Retention

The `cleanup-data` function runs daily at 2 AM and removes:
- Logs older than 30 days (configurable via `LOG_RETENTION_DAYS`)
- Resolved issues older than 90 days

To run manually:
```bash
doctl serverless functions invoke monitoring/cleanup-data
```

### Resolve Issues

```sql
-- Mark issue as resolved
UPDATE "LogIssue"
SET status = 'resolved', "resolvedAt" = NOW(), "updatedAt" = NOW()
WHERE id = 'issue-uuid';

-- Bulk resolve old issues
UPDATE "LogIssue"
SET status = 'resolved', "resolvedAt" = NOW(), "updatedAt" = NOW()
WHERE status = 'open' AND "detectedAt" < NOW() - INTERVAL '7 days';
```

### Reset Analyzed Logs

If you need to re-analyze logs:

```sql
-- Reset all logs
UPDATE "LogEntry" SET analyzed = false;

-- Reset recent logs
UPDATE "LogEntry"
SET analyzed = false
WHERE timestamp > NOW() - INTERVAL '1 hour';
```

## Uptime Monitoring

### Create Uptime Checks

```bash
# Blue node
doctl monitoring uptime-check create \
  --name "fleexstack-blue" \
  --type "http" \
  --target "http://209.38.248.218:3000/health" \
  --regions "fra1"

# Green node
doctl monitoring uptime-check create \
  --name "fleexstack-green" \
  --type "http" \
  --target "http://209.38.209.155:3000/health" \
  --regions "fra1"
```

### Configure Alerts

In DO Console:
1. Go to Monitoring → Alerts
2. Create alert for uptime check failures
3. Set notification channels (email, Slack)

## Cost Management

| Service | Free Tier | Typical Usage |
|---------|-----------|---------------|
| DO Functions | 25,000 invocations/month | ~15,000/month |
| DO Uptime | 5 checks | 3 checks |

The monitoring system runs within the free tier.

### Reduce Invocations

If approaching limits:

1. Reduce scheduler frequency in `project.yml`
2. Increase intervals between function runs
3. Batch more work per invocation

## Security

### Secrets Management

- Never commit `.env` files
- Use GitHub Secrets for CI/CD
- Rotate API keys periodically

### Database Access

- Use SSL for all database connections
- Restrict database firewall to DO Functions IPs
- Use dedicated database user with minimal permissions

### GenAI Security

- API key provides Bearer token authentication
- Requests are encrypted via HTTPS
- Agent access is scoped to the workspace

## See Also

- [Debugging Guide](./debugging.md) - Troubleshooting
- [Developer Guide](./developers.md) - Implementation details
