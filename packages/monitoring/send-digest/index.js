export async function main(event, context) {
  console.log('[send-digest] Started')

  try {
    const digest = {
      date: new Date().toISOString().split('T')[0],
      summary: {
        totalLogs: 0,
        errorLogs: 0,
        errorRate: '0%',
        openIssues: 0,
        resolvedIssues: 0,
      },
    }

    console.log('[send-digest] Digest:', JSON.stringify(digest))
    console.log('[send-digest] Completed')

    return {
      body: {
        success: true,
        digest,
      },
    }
  } catch (error) {
    console.error('[send-digest] Fatal error:', error.message)
    return {
      body: {
        success: false,
        error: error.message,
      },
    }
  }
}
