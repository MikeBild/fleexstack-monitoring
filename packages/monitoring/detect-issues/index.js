import pg from 'pg'
import crypto from 'crypto'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
})

export async function main(event, context) {
  console.log('[detect-issues] Started')

  const client = await pool.connect()
  try {
    const issues = []
    const since = new Date(Date.now() - 15 * 60 * 1000)

    const { rows: [counts] } = await client.query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE level IN ('error', 'fatal')) as errors
       FROM "LogEntry"
       WHERE timestamp > $1`,
      [since]
    )

    const total = parseInt(counts.total)
    const errors = parseInt(counts.errors)
    const errorRate = total > 0 ? errors / total : 0

    console.log(`[detect-issues] Stats: total=${total}, errors=${errors}, rate=${(errorRate * 100).toFixed(2)}%`)

    if (errorRate > 0.05 && total > 10) {
      issues.push({
        type: 'high-error-rate',
        severity: 'high',
        title: `High error rate: ${(errorRate * 100).toFixed(1)}%`,
        description: `Error rate exceeded 5% threshold with ${errors} errors out of ${total} logs in the last 15 minutes`,
        recommendation: 'Review recent deployments and check application logs for root cause',
      })
    }

    const { rows: repeatedErrors } = await client.query(
      `SELECT message, COUNT(*) as count, source
       FROM "LogEntry"
       WHERE level IN ('error', 'fatal') AND timestamp > $1
       GROUP BY message, source
       HAVING COUNT(*) > 5
       ORDER BY count DESC
       LIMIT 5`,
      [since]
    )

    for (const err of repeatedErrors) {
      issues.push({
        type: 'repeated-error',
        severity: 'medium',
        title: `Repeated error (${err.count}x): ${err.message.substring(0, 50)}`,
        description: `Error repeated ${err.count} times on ${err.source} node`,
        recommendation: 'Investigate the root cause of this recurring error',
        metadata: { message: err.message, source: err.source, count: err.count },
      })
    }

    const { rows: memoryWarnings } = await client.query(
      `SELECT COUNT(*) as count FROM "LogEntry"
       WHERE timestamp > $1 AND message ILIKE '%memory%' AND level IN ('warn', 'error')`,
      [since]
    )

    if (parseInt(memoryWarnings[0].count) > 3) {
      issues.push({
        type: 'memory-warning',
        severity: 'high',
        title: `Memory warnings detected (${memoryWarnings[0].count}x)`,
        description: 'Multiple memory-related warnings detected in the last 15 minutes',
        recommendation: 'Check memory usage on nodes and consider scaling or optimization',
      })
    }

    const { rows: connectionErrors } = await client.query(
      `SELECT COUNT(*) as count FROM "LogEntry"
       WHERE timestamp > $1 AND (message ILIKE '%ECONNREFUSED%' OR message ILIKE '%ETIMEDOUT%')`,
      [since]
    )

    if (parseInt(connectionErrors[0].count) > 0) {
      issues.push({
        type: 'connection-failure',
        severity: 'medium',
        title: `Connection failures detected (${connectionErrors[0].count}x)`,
        description: 'Network connection errors detected',
        recommendation: 'Check network connectivity and service availability',
      })
    }

    let created = 0
    let updated = 0
    for (const issue of issues) {
      // Check for existing similar open issue
      const { rows: existing } = await client.query(
        `SELECT id, metadata FROM "LogIssue"
         WHERE type = $1 AND status = 'open'
         AND "detectedAt" > NOW() - INTERVAL '1 hour'
         LIMIT 1`,
        [issue.type]
      )

      if (existing.length > 0) {
        // Update existing issue: increment counter and update timestamp
        const currentMetadata = existing[0].metadata || {}
        const occurrences = (currentMetadata.occurrences || 1) + 1
        await client.query(
          `UPDATE "LogIssue"
           SET "updatedAt" = NOW(),
               metadata = metadata || $1
           WHERE id = $2`,
          [JSON.stringify({ occurrences, lastSeen: new Date().toISOString() }), existing[0].id]
        )
        console.log(`[detect-issues] Updated existing issue: ${issue.type} (${occurrences}x)`)
        updated++
        continue
      }

      await client.query(
        `INSERT INTO "LogIssue" (id, type, severity, title, description, "rootCause", recommendation, source, status, "detectedAt", "updatedAt", metadata, "affectedLogs")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          crypto.randomUUID(),
          issue.type,
          issue.severity,
          issue.title,
          issue.description,
          issue.rootCause || null,
          issue.recommendation || null,
          'detector',
          'open',
          new Date(),
          new Date(),
          JSON.stringify(issue.metadata || {}),
          [],
        ]
      )
      created++
    }

    console.log(`[detect-issues] Completed: detected=${issues.length}, created=${created}, updated=${updated}, errorRate=${(errorRate * 100).toFixed(2)}%`)

    return {
      body: {
        success: true,
        issuesDetected: issues.length,
        issuesCreated: created,
        issuesUpdated: updated,
        errorRate: (errorRate * 100).toFixed(2) + '%',
      },
    }
  } catch (error) {
    console.error('[detect-issues] Fatal error:', error.message)
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
