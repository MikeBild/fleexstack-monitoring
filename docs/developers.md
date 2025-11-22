# Developer Guide

Implementation details for extending and customizing the monitoring system.

## Project Structure

```
fleexstack-monitoring/
├── project.yml                 # DO Functions configuration
├── packages/
│   └── monitoring/
│       ├── scheduler/          # Cron scheduler
│       ├── collect-logs/       # Log collection
│       ├── analyze-logs/       # AI analysis
│       ├── detect-issues/      # Pattern detection
│       ├── predict-issues/     # Trend prediction
│       ├── send-digest/        # Daily reports
│       └── cleanup-data/       # Data retention
└── docs/
```

## Database Schema

### LogEntry

```sql
CREATE TABLE "LogEntry" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp   TIMESTAMP NOT NULL,
  level       VARCHAR NOT NULL,      -- info, warn, error, fatal
  message     TEXT NOT NULL,
  source      VARCHAR NOT NULL,      -- blue, green
  hostname    VARCHAR NOT NULL,      -- IP address of source
  metadata    JSONB,
  analyzed    BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMP DEFAULT NOW()
);
```

### LogIssue

```sql
CREATE TABLE "LogIssue" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type           VARCHAR NOT NULL,
  severity       VARCHAR NOT NULL,   -- low, medium, high, critical
  title          VARCHAR NOT NULL,
  description    TEXT NOT NULL,
  "rootCause"    TEXT,
  recommendation TEXT,
  source         VARCHAR NOT NULL,   -- genai, detector, predictor
  status         VARCHAR DEFAULT 'open',
  "detectedAt"   TIMESTAMP NOT NULL,
  "updatedAt"    TIMESTAMP NOT NULL,
  "resolvedAt"   TIMESTAMP,
  metadata       JSONB,
  "affectedLogs" UUID[]
);
```

## Function Implementation

### Basic Structure

Each function follows this pattern:

```javascript
import pg from 'pg'
import crypto from 'crypto'

// Disable SSL cert verification for DO managed databases
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
})

export async function main(event, context) {
  console.log('[function-name] Started')

  const client = await pool.connect()
  try {
    // Your logic here

    return {
      body: {
        success: true,
        // results
      },
    }
  } catch (error) {
    console.error('[function-name] Error:', error.message)
    return {
      body: {
        success: false,
        error: error.message,
      },
    }
  } finally {
    client.release()
  }
}
```

### GenAI Integration

The `analyze-logs` function uses DO GenAI for intelligent analysis:

```javascript
const baseUrl = process.env.GENAI_AGENT_URL.replace(/\/$/, '')
const genaiUrl = `${baseUrl}/api/v1/chat/completions`

const requestBody = {
  messages: [
    {
      role: 'system',
      content: 'You are a log analysis assistant...',
    },
    {
      role: 'user',
      content: `Analyze these logs:\n\n${logsText}`,
    },
  ],
  max_tokens: 1000,
}

const headers = { 'Content-Type': 'application/json' }
if (process.env.GENAI_API_KEY) {
  headers['Authorization'] = `Bearer ${process.env.GENAI_API_KEY}`
}

const response = await fetch(genaiUrl, {
  method: 'POST',
  headers,
  body: JSON.stringify(requestBody),
  signal: AbortSignal.timeout(30000),
})

// Parse OpenAI-compatible response
const result = await response.json()
const content = result.choices?.[0]?.message?.content || ''
```

## Adding a New Function

### 1. Create Function Directory

```bash
mkdir packages/monitoring/my-function
```

### 2. Create package.json

```json
{
  "name": "my-function",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "dependencies": {
    "pg": "^8.11.0"
  }
}
```

### 3. Implement index.js

```javascript
import pg from 'pg'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
})

export async function main(event, context) {
  console.log('[my-function] Started')

  const client = await pool.connect()
  try {
    // Your implementation

    return { body: { success: true } }
  } finally {
    client.release()
  }
}
```

### 4. Add to project.yml

```yaml
- name: my-function
  runtime: nodejs:18
  main: main
  web: true
  limits:
    timeout: 60000
    memory: 128
```

### 5. Deploy

```bash
doctl serverless deploy .
```

## Adding Issue Detection Patterns

Edit `packages/monitoring/detect-issues/index.js`:

```javascript
// Check for your pattern
const { rows: myPatternLogs } = await client.query(
  `SELECT COUNT(*) as count FROM "LogEntry"
   WHERE timestamp > $1 AND message ILIKE '%MyPattern%'`,
  [since]
)

if (parseInt(myPatternLogs[0].count) > 5) {
  issues.push({
    type: 'my-pattern-detected',
    severity: 'medium',
    title: `MyPattern detected ${myPatternLogs[0].count} times`,
    description: 'Description of the issue',
    recommendation: 'How to fix it',
  })
}
```

## Inserting Issues

When creating LogIssue records, include all required fields:

```javascript
await client.query(
  `INSERT INTO "LogIssue" (
    id, type, severity, title, description,
    "rootCause", recommendation, source, status,
    "detectedAt", "updatedAt", metadata, "affectedLogs"
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
  [
    crypto.randomUUID(),
    issue.type,
    issue.severity,
    issue.title,
    issue.description,
    issue.rootCause || null,
    issue.recommendation || null,
    'detector',           // source: genai, detector, predictor
    'open',
    new Date(),           // detectedAt
    new Date(),           // updatedAt
    JSON.stringify(issue.metadata || {}),
    [],                   // affectedLogs
  ]
)
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `BLUE_HOST` | Yes | Blue node IP address |
| `GREEN_HOST` | Yes | Green node IP address |
| `GENAI_AGENT_URL` | No | DO GenAI agent base URL |
| `GENAI_API_KEY` | No | DO GenAI API key (Bearer token) |
| `ALERTS_REPO` | No | GitHub repo for issue alerts |
| `GH_TOKEN` | No | GitHub token for creating issues |
| `LOG_RETENTION_DAYS` | No | Days to keep logs (default: 30) |

## Testing Locally

```bash
cd packages/monitoring/my-function
npm install

# Set environment
export DATABASE_URL=postgresql://...
export GENAI_AGENT_URL=https://...
export GENAI_API_KEY=...

# Run function
node -e "import('./index.js').then(m => m.main({}).then(console.log))"
```

## Best Practices

1. **Always release database connections** - Use try/finally pattern
2. **Set timeouts on external calls** - Use AbortSignal.timeout()
3. **Log important events** - Helps with debugging
4. **Handle errors gracefully** - Return meaningful error messages
5. **Keep functions fast** - Target <60s execution time
6. **Use max_tokens for GenAI** - Prevents timeout errors

## See Also

- [Operator Guide](./operators.md) - Deployment and monitoring
- [Debugging Guide](./debugging.md) - Troubleshooting
