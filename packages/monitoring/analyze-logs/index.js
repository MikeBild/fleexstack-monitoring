const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main(args) {
  // Get unanalyzed logs
  const logs = await prisma.logEntry.findMany({
    where: { analyzed: false },
    take: 100,
    orderBy: { timestamp: 'desc' },
  })

  if (logs.length === 0) {
    await prisma.$disconnect()
    return { body: { success: true, analyzed: 0, issuesDetected: 0 } }
  }

  let issuesDetected = 0

  // Call GenAI for analysis
  if (process.env.GENAI_AGENT_URL) {
    try {
      // Call GenAI for analysis
      const response = await fetch(process.env.GENAI_AGENT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: 'log-analysis',
          action: 'analyze-logs',
          data: {
            logs: logs.map((log, index) => ({
              index,
              timestamp: log.timestamp.toISOString(),
              level: log.level,
              message: log.message,
              source: log.source,
              metadata: log.metadata,
            })),
          },
        }),
        timeout: 30000,
      })

      if (response.ok) {
        const analysis = await response.json()

        // Store detected issues
        if (analysis.issuesDetected && Array.isArray(analysis.issuesDetected)) {
          for (const issue of analysis.issuesDetected) {
            await prisma.logIssue.create({
              data: {
                type: issue.type || 'unknown',
                severity: issue.severity || 'medium',
                title: issue.title || 'Detected Issue',
                description: issue.description || '',
                rootCause: issue.rootCause,
                recommendation: issue.recommendation,
                source: 'genai-analysis',
                detectedAt: new Date(),
                metadata: issue.metadata || {},
              },
            })
            issuesDetected++
          }
        }
      }
    } catch (error) {
      console.error('GenAI analysis failed:', error.message)
    }
  }

  // Mark logs as analyzed
  await prisma.logEntry.updateMany({
    where: { id: { in: logs.map(l => l.id) } },
    data: { analyzed: true },
  })

  await prisma.$disconnect()

  return {
    body: {
      success: true,
      analyzed: logs.length,
      issuesDetected,
    },
  }
}

exports.main = main
