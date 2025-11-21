async function main(event, context) {
  let issuesDetected = 0

  if (process.env.GENAI_AGENT_URL) {
    try {
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

      if (response.ok) {
        const analysis = await response.json()
        if (analysis.issuesDetected && Array.isArray(analysis.issuesDetected)) {
          issuesDetected = analysis.issuesDetected.length
        }
      }
    } catch (error) {
      console.error('GenAI analysis failed:', error.message)
    }
  }

  return {
    body: {
      success: true,
      analyzed: 0,
      issuesDetected,
    },
  }
}

exports.main = main
