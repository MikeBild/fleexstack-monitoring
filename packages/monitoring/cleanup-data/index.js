export async function main(event, context) {
  const logRetentionDays = parseInt(process.env.LOG_RETENTION_DAYS || '30')
  const issueRetentionDays = 90

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
}

