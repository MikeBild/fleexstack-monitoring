import pg from 'pg'
import crypto from 'crypto'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

export async function main(event, context) {
  console.log('[analyze-logs] Started')
  console.log('[analyze-logs] GENAI_AGENT_URL:', process.env.GENAI_AGENT_URL ? 'configured' : 'not set')

  const client = await pool.connect()
  try {
    const { rows: logs } = await client.query(
      `SELECT id, timestamp, level, message, source, metadata
       FROM "LogEntry"
       WHERE analyzed = false
       ORDER BY timestamp DESC
       LIMIT 100`
    )

    console.log(`[analyze-logs] Found ${logs.length} unanalyzed logs`)

    if (logs.length === 0) {
      return {
        body: {
          success: true,
          analyzed: 0,
          issuesDetected: 0,
        },
      }
    }

    let issuesDetected = 0

    if (process.env.GENAI_AGENT_URL) {
      try {
        console.log('[analyze-logs] Calling GenAI agent')
        const response = await fetch(process.env.GENAI_AGENT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: 'log-analysis',
            action: 'analyze-logs',
            data: {
              logs: logs.map((log, index) => ({
                index,
                timestamp: log.timestamp,
                level: log.level,
                message: log.message,
                source: log.source,
              })),
            },
          }),
          signal: AbortSignal.timeout(30000),
        })

        console.log(`[analyze-logs] GenAI response: ${response.status}`)

        if (response.ok) {
          const analysis = await response.json()
          const issues = analysis.issuesDetected || analysis.issues || []

          for (const issue of issues) {
            await client.query(
              `INSERT INTO "LogIssue" (id, type, severity, title, description, "rootCause", recommendation, source, status, "detectedAt", metadata)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
              [
                crypto.randomUUID(),
                issue.type || 'ai-detected',
                issue.severity || 'medium',
                issue.title || 'Issue detected by AI',
                issue.description || '',
                issue.rootCause || null,
                issue.recommendation || null,
                'genai',
                'open',
                new Date(),
                JSON.stringify(issue.metadata || {}),
              ]
            )
            issuesDetected++
          }
          console.log('[analyze-logs] Issues created:', issuesDetected)
        }
      } catch (error) {
        console.error('[analyze-logs] GenAI failed:', error.message)
      }
    } else {
      console.log('[analyze-logs] Skipping GenAI (not configured)')
    }

    const logIds = logs.map(l => l.id)
    await client.query(
      `UPDATE "LogEntry" SET analyzed = true WHERE id = ANY($1)`,
      [logIds]
    )
    console.log(`[analyze-logs] Marked ${logIds.length} logs as analyzed`)

    console.log('[analyze-logs] Completed')

    return {
      body: {
        success: true,
        analyzed: logs.length,
        issuesDetected,
      },
    }
  } catch (error) {
    console.error('[analyze-logs] Fatal error:', error.message)
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
