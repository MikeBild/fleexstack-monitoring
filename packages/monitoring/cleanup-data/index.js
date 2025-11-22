import pg from 'pg'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
})

export async function main(event, context) {
  console.log('[cleanup-data] Started')

  const client = await pool.connect()
  try {
    const logRetentionDays = parseInt(process.env.LOG_RETENTION_DAYS || '30')
    const issueRetentionDays = 90

    const logCutoff = new Date(Date.now() - logRetentionDays * 24 * 60 * 60 * 1000)
    const issueCutoff = new Date(Date.now() - issueRetentionDays * 24 * 60 * 60 * 1000)

    console.log('[cleanup-data] Log retention:', logRetentionDays, 'days')
    console.log('[cleanup-data] Issue retention:', issueRetentionDays, 'days')
    console.log('[cleanup-data] Log cutoff:', logCutoff.toISOString())
    console.log('[cleanup-data] Issue cutoff:', issueCutoff.toISOString())

    const logResult = await client.query(
      `DELETE FROM "LogEntry" WHERE timestamp < $1`,
      [logCutoff]
    )
    const deletedLogs = logResult.rowCount

    const issueResult = await client.query(
      `DELETE FROM "LogIssue" WHERE status = 'resolved' AND "resolvedAt" < $1`,
      [issueCutoff]
    )
    const deletedIssues = issueResult.rowCount

    console.log('[cleanup-data] Deleted logs:', deletedLogs)
    console.log('[cleanup-data] Deleted issues:', deletedIssues)
    console.log('[cleanup-data] Completed')

    return {
      body: {
        success: true,
        deletedLogs,
        deletedIssues,
        retentionDays: {
          logs: logRetentionDays,
          issues: issueRetentionDays,
        },
      },
    }
  } catch (error) {
    console.error('[cleanup-data] Fatal error:', error.message)
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
