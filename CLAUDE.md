# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Serverless log monitoring system for DigitalOcean Functions with AI-powered analysis. Monitors blue/green infrastructure nodes, detects issues via pattern matching and GenAI, and creates GitHub issues for alerts.

## Commands

### Deployment

```bash
# Deploy all functions
source .env
doctl serverless deploy .

# Deploy specific function
doctl serverless deploy . --include "packages/monitoring/analyze-logs"

# Connect to namespace
doctl serverless connect fleexstack-monitoring
```

### Testing Functions

```bash
# Invoke function synchronously
doctl serverless functions invoke monitoring/collect-logs

# Invoke with parameters
doctl serverless functions invoke monitoring/ai-agent-get-runbook -p issue_type:high-error-rate

# View activations and logs
doctl serverless activations list --limit 20
doctl serverless activations logs --last
```

### Local Development

```bash
cd packages/monitoring/<function-name>
npm install

# Run function locally
node -e "import('./index.js').then(m => m.main({}).then(console.log))"
```

## Architecture

### Function Execution Flow

The `scheduler` function runs every minute via cron trigger and invokes other functions based on schedule:
- Every 5 min: `collect-logs`
- Every 15 min: `analyze-logs`, `detect-issues`, `version-bump-bot`
- Hourly: `predict-issues`
- Daily 8 AM: `send-digest`
- Daily 2 AM: `cleanup-data`

Functions are invoked via HTTP POST to web endpoints, not OpenWhisk actions.

### Database Tables

- **LogEntry**: Collected logs with `analyzed` boolean for GenAI processing state
- **LogIssue**: Detected issues with `source` (genai/detector/predictor), auto-resolution via metadata

### GenAI Integration

`analyze-logs` calls DO GenAI Agent at `GENAI_AGENT_URL/api/v1/chat/completions` with OpenAI-compatible format. Knowledge Base functions (`ai-agent-get-runbook`, `ai-agent-search-incidents`, `ai-agent-search-github-issues`) provide context via function routes.

### Issue Lifecycle

1. Detection creates/updates LogIssue (deduplication by type within 1 hour)
2. Issues increment `metadata.occurrences` on duplicate detection
3. Auto-resolution when patterns disappear (grace period varies by source)

## Function Pattern

All functions follow this structure:

```javascript
import pg from 'pg'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
})

export async function main(event, context) {
  const client = await pool.connect()
  try {
    // Logic here
    return { body: { success: true, ... } }
  } finally {
    client.release()
  }
}
```

## Environment Variables

Required: `DATABASE_URL`, `BLUE_HOST`, `GREEN_HOST`
Optional: `GENAI_AGENT_URL`, `GENAI_API_KEY`, `ALERTS_REPO`, `GH_TOKEN`
KB Sync: `SPACES_ACCESS_KEY_ID`, `SPACES_SECRET_ACCESS_KEY`, `SPACES_BUCKET`, `SPACES_REGION`

## Documentation

Detailed docs in `docs/` folder:
- `README.md` - Overview and navigation
- `operators.md` - Deployment and operations
- `developers.md` - Implementation details
- `architecture.md` - System diagrams
- `knowledge-base-integration.md` - GenAI KB setup
