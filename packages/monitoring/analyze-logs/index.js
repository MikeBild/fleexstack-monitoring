import pg from 'pg'
import crypto from 'crypto'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
})

export async function main(event, context) {
  console.log('[analyze-logs] Started')
  console.log('[analyze-logs] GENAI_AGENT_URL:', process.env.GENAI_AGENT_URL ? 'configured' : 'not set')
  console.log('[analyze-logs] GENAI_API_KEY:', process.env.GENAI_API_KEY ? 'configured' : 'not set')

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
        const baseUrl = process.env.GENAI_AGENT_URL.replace(/\/$/, '')
        const genaiUrl = `${baseUrl}/api/v1/chat/completions`
        console.log('[analyze-logs] Calling GenAI agent:', genaiUrl)

        const requestBody = {
          messages: [
            {
              role: 'system',
              content: 'You are a log analysis assistant. Analyze the provided logs and identify any issues, errors, or anomalies. Return a JSON object with an "issues" array containing objects with: type, severity (low/medium/high/critical), title, description, rootCause, and recommendation.',
            },
            {
              role: 'user',
              content: `Analyze these logs and identify any issues:\n\n${logs.map((log, index) => `[${index}] ${log.timestamp} [${log.level}] ${log.source}: ${log.message}`).join('\n')}`,
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

        console.log(`[analyze-logs] GenAI response: ${response.status}`)

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`[analyze-logs] GenAI error body: ${errorText}`)
        }

        if (response.ok) {
          const result = await response.json()
          const content = result.choices?.[0]?.message?.content || ''
          console.log('[analyze-logs] GenAI content:', content.substring(0, 200))

          let issues = []
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0])
              issues = parsed.issues || parsed.issuesDetected || []
            }
          } catch (parseError) {
            console.error('[analyze-logs] Failed to parse GenAI response:', parseError.message)
          }

          for (const issue of issues) {
            await client.query(
              `INSERT INTO "LogIssue" (id, type, severity, title, description, "rootCause", recommendation, source, status, "detectedAt", "updatedAt", metadata, "affectedLogs")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
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
                new Date(),
                JSON.stringify(issue.metadata || {}),
                issue.affectedLogs || [],
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
