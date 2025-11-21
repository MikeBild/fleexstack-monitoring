export async function main(event, context) {
  console.log('[analyze-logs] Started')
  console.log('[analyze-logs] GENAI_AGENT_URL:', process.env.GENAI_AGENT_URL ? 'configured' : 'not set')

  try {
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
            data: { logs: [] },
          }),
          signal: AbortSignal.timeout(30000),
        })

        console.log(`[analyze-logs] GenAI response: ${response.status}`)

        if (response.ok) {
          const analysis = await response.json()
          if (analysis.issuesDetected && Array.isArray(analysis.issuesDetected)) {
            issuesDetected = analysis.issuesDetected.length
          }
          console.log('[analyze-logs] Issues detected:', issuesDetected)
        }
      } catch (error) {
        console.error('[analyze-logs] GenAI failed:', error.message)
      }
    } else {
      console.log('[analyze-logs] Skipping GenAI (not configured)')
    }

    console.log('[analyze-logs] Completed')

    return {
      body: {
        success: true,
        analyzed: 0,
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
  }
}
