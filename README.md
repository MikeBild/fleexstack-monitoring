# FleexStack Monitoring - DigitalOcean Functions

Serverless monitoring functions for FleexStack infrastructure.

## Functions

| Function | Schedule | Description |
|----------|----------|-------------|
| `collect-logs` | Every 5 min | Fetch logs from blue/green nodes |
| `analyze-logs` | Every 15 min | GenAI-powered log analysis |
| `detect-issues` | Every 15 min | Pattern-based issue detection |
| `predict-issues` | Hourly | Trend analysis and prediction |
| `send-digest` | Daily 8 AM | Daily summary report |
| `cleanup-data` | Daily 2 AM | Clean old logs and issues |

## Setup

### Prerequisites

```bash
# Install doctl
brew install doctl

# Authenticate
doctl auth init

# Install serverless plugin
doctl serverless install
```

### Create Namespace

```bash
doctl serverless namespaces create fleexstack-monitoring --region fra1
doctl serverless connect fleexstack-monitoring
```

### Configure Environment Variables

Set these in DO Functions console or via CLI:

```bash
# Required
doctl serverless functions env set DATABASE_URL "postgresql://..."
doctl serverless functions env set BLUE_HOST "209.38.248.218"
doctl serverless functions env set GREEN_HOST "209.38.209.155"

# Optional (for GenAI)
doctl serverless functions env set GENAI_ENABLED "true"
doctl serverless functions env set GENAI_AGENT_URL "https://..."
```

## Deployment

### Automatic (via GitHub Actions)

Push to main branch with changes in `do-functions/` directory.

### Manual

```bash
cd do-functions
doctl serverless deploy .
```

### Deploy Specific Function

```bash
doctl serverless deploy . --include "packages/monitoring/collect-logs"
```

## Testing

### Invoke Function

```bash
doctl serverless functions invoke monitoring/collect-logs
```

### View Logs

```bash
# Last activation
doctl serverless activations logs --last

# Follow logs
doctl serverless activations logs --follow

# Specific activation
doctl serverless activations logs <activation-id>
```

### List Activations

```bash
doctl serverless activations list --limit 10
```

## Local Development

Functions use Prisma for database access. Generate client locally:

```bash
cd do-functions/packages/monitoring/collect-logs
npm install
npx prisma generate
```

## Troubleshooting

### Function Timeout

Increase timeout in `project.yml`:

```yaml
functions:
  - name: collect-logs
    timeout: 120000  # 2 minutes
```

### Database Connection

Ensure `DATABASE_URL` is set and accessible from DO Functions (check firewall).

### View Errors

```bash
doctl serverless activations list --limit 5
doctl serverless activations get <activation-id>
```

## Cost

- **Free tier**: 25,000 invocations/month
- **Estimated usage**: ~15,000 invocations/month
- **Cost**: Covered by free tier
