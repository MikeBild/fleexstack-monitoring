export async function main(event, context) {
  console.log('[cleanup-data] Started')

  try {
    const logRetentionDays = parseInt(process.env.LOG_RETENTION_DAYS || '30')
    const issueRetentionDays = 90

    console.log('[cleanup-data] Log retention:', logRetentionDays, 'days')
    console.log('[cleanup-data] Issue retention:', issueRetentionDays, 'days')
    console.log('[cleanup-data] Completed')

    return {
      body: {
        success: true,
        deletedLogs: 0,
        deletedIssues: 0,
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
  }
}
