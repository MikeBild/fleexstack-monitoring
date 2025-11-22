# Quick Start Guide

Get the FleexStack monitoring system running in 5 minutes.

## Prerequisites

- [doctl](https://docs.digitalocean.com/reference/doctl/) CLI installed and authenticated
- Access to DigitalOcean account with Functions enabled
- PostgreSQL database with monitoring tables created

## 1. Clone Repository

```bash
git clone https://github.com/MikeBild/fleexstack-monitoring.git
cd fleexstack-monitoring
```

## 2. Create Functions Namespace

```bash
doctl serverless namespaces create fleexstack-monitoring --region fra1
doctl serverless connect fleexstack-monitoring
```

## 3. Configure Environment

Create a `.env` file with your configuration:

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:25060/dbname?sslmode=require
BLUE_HOST=209.38.248.218
GREEN_HOST=209.38.209.155

# GenAI (optional but recommended)
GENAI_AGENT_URL=https://your-agent.agents.do-ai.run
GENAI_API_KEY=your-api-key

# GitHub (for alerts)
ALERTS_REPO=your-org/your-repo
GH_TOKEN=your-github-token
```

## 4. Deploy Functions

```bash
source .env
doctl serverless deploy .
```

## 5. Verify Deployment

```bash
# List deployed functions
doctl serverless functions list

# Test collect-logs
doctl serverless functions invoke monitoring/collect-logs

# Check result
doctl serverless activations list --limit 5
```

## 6. Test the Pipeline

```bash
# Collect logs from nodes
doctl serverless functions invoke monitoring/collect-logs

# Run AI analysis
doctl serverless functions invoke monitoring/analyze-logs

# Check for issues
doctl serverless functions invoke monitoring/detect-issues
```

## What Happens Next

Once deployed, the scheduler automatically triggers functions:

- **Every minute**: Scheduler checks which functions to run
- **Every 5 minutes**: `collect-logs` fetches logs from nodes
- **Every 15 minutes**: `analyze-logs` and `detect-issues` process logs
- **Every hour**: `predict-issues` analyzes trends
- **Daily at 8 AM**: `send-digest` creates summary
- **Daily at 2 AM**: `cleanup-data` removes old data

## Verify Data Collection

Check that logs are being stored:

```sql
-- Recent logs
SELECT source, level, COUNT(*)
FROM "LogEntry"
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY source, level;

-- Detected issues
SELECT type, severity, title, "detectedAt"
FROM "LogIssue"
WHERE status = 'open'
ORDER BY "detectedAt" DESC
LIMIT 10;
```

## Next Steps

- [Developer Guide](./developers.md) - Extend and customize functions
- [Operator Guide](./operators.md) - Production deployment and monitoring
- [Debugging Guide](./debugging.md) - Troubleshoot issues
