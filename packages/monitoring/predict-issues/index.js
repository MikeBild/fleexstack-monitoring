import pg from 'pg'
import crypto from 'crypto'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
})

export async function main(event, context) {
  console.log('[predict-issues] Started')

  const client = await pool.connect()
  try {
    const predictions = []

    const { rows: hourlyTrend } = await client.query(
      `SELECT
         DATE_TRUNC('hour', timestamp) as hour,
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE level IN ('error', 'fatal')) as errors
       FROM "LogEntry"
       WHERE timestamp > NOW() - INTERVAL '24 hours'
       GROUP BY hour
       ORDER BY hour DESC
       LIMIT 24`
    )

    console.log(`[predict-issues] Analyzed ${hourlyTrend.length} hours of data`)

    if (hourlyTrend.length >= 3) {
      const recent = hourlyTrend.slice(0, 3)
      const recentErrorRate = recent.reduce((sum, h) => sum + parseInt(h.errors), 0) /
                              Math.max(1, recent.reduce((sum, h) => sum + parseInt(h.total), 0))

      const older = hourlyTrend.slice(3, 6)
      const olderErrorRate = older.length > 0
        ? older.reduce((sum, h) => sum + parseInt(h.errors), 0) /
          Math.max(1, older.reduce((sum, h) => sum + parseInt(h.total), 0))
        : 0

      if (recentErrorRate > olderErrorRate * 1.5 && recentErrorRate > 0.02) {
        predictions.push({
          type: 'error-rate-trending-up',
          severity: 'medium',
          title: 'Error rate trending upward',
          description: `Error rate increased from ${(olderErrorRate * 100).toFixed(1)}% to ${(recentErrorRate * 100).toFixed(1)}% in recent hours`,
          recommendation: 'Monitor closely and investigate if trend continues',
        })
      }
    }

    const { rows: volumeTrend } = await client.query(
      `SELECT
         DATE_TRUNC('hour', timestamp) as hour,
         COUNT(*) as total
       FROM "LogEntry"
       WHERE timestamp > NOW() - INTERVAL '6 hours'
       GROUP BY hour
       ORDER BY hour DESC`
    )

    if (volumeTrend.length >= 2) {
      const recentVolume = parseInt(volumeTrend[0]?.total || 0)
      const avgVolume = volumeTrend.slice(1).reduce((sum, h) => sum + parseInt(h.total), 0) /
                        Math.max(1, volumeTrend.length - 1)

      if (recentVolume > avgVolume * 2 && recentVolume > 100) {
        predictions.push({
          type: 'log-volume-spike',
          severity: 'low',
          title: 'Unusual log volume detected',
          description: `Current hour has ${recentVolume} logs vs average of ${avgVolume.toFixed(0)}`,
          recommendation: 'Check for unusual activity or potential issues',
        })
      }
    }

    const { rows: [openIssues] } = await client.query(
      `SELECT COUNT(*) as count FROM "LogIssue" WHERE status = 'open'`
    )

    if (parseInt(openIssues.count) > 10) {
      predictions.push({
        type: 'issue-backlog',
        severity: 'medium',
        title: `${openIssues.count} unresolved issues`,
        description: 'High number of open issues may indicate systemic problems',
        recommendation: 'Review and resolve or close stale issues',
      })
    }

    let created = 0
    let updated = 0
    for (const prediction of predictions) {
      // Check for existing similar open issue
      const { rows: existing } = await client.query(
        `SELECT id, metadata FROM "LogIssue"
         WHERE type = $1 AND status = 'open'
         AND "detectedAt" > NOW() - INTERVAL '6 hours'
         LIMIT 1`,
        [prediction.type]
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
        console.log(`[predict-issues] Updated existing prediction: ${prediction.type} (${occurrences}x)`)
        updated++
        continue
      }

      await client.query(
        `INSERT INTO "LogIssue" (id, type, severity, title, description, "rootCause", recommendation, source, status, "detectedAt", "updatedAt", metadata, "affectedLogs")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          crypto.randomUUID(),
          prediction.type,
          prediction.severity,
          prediction.title,
          prediction.description,
          prediction.rootCause || null,
          prediction.recommendation || null,
          'predictor',
          'open',
          new Date(),
          new Date(),
          JSON.stringify(prediction.metadata || {}),
          [],
        ]
      )
      created++
    }

    console.log(`[predict-issues] Completed: detected=${predictions.length}, created=${created}, updated=${updated}`)

    return {
      body: {
        success: true,
        predictions: predictions.length,
        predictionsCreated: created,
        predictionsUpdated: updated,
        logsAnalyzed: hourlyTrend.reduce((sum, h) => sum + parseInt(h.total), 0),
      },
    }
  } catch (error) {
    console.error('[predict-issues] Fatal error:', error.message)
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
