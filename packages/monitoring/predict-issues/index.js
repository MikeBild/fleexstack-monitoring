import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main(args) {
  const since = new Date(Date.now() - 60 * 60 * 1000)

  const logs = await prisma.logEntry.findMany({
    where: { timestamp: { gte: since } },
    orderBy: { timestamp: 'asc' },
  })

  if (logs.length === 0) {
    await prisma.$disconnect()
    return { body: { success: true, predictions: 0 } }
  }

  const predictions = []

  const errorsByInterval = {}
  for (const log of logs) {
    if (log.level === 'error' || log.level === 'fatal') {
      const interval = Math.floor(log.timestamp.getTime() / (5 * 60 * 1000))
      errorsByInterval[interval] = (errorsByInterval[interval] || 0) + 1
    }
  }

  const intervals = Object.keys(errorsByInterval).sort()
  if (intervals.length >= 3) {
    const recent = intervals.slice(-3).map(i => errorsByInterval[i])
    const trend = recent[2] - recent[0]

    if (trend > 5) {
      predictions.push({
        type: 'error-rate-increase',
        severity: 'medium',
        title: 'Error rate trending up',
        description: `Error rate increased from ${recent[0]} to ${recent[2]} over last 15 minutes`,
        recommendation: 'Monitor closely and prepare for potential issues',
      })
    }
  }

  for (const prediction of predictions) {
    await prisma.logIssue.create({
      data: {
        ...prediction,
        source: 'predictor',
        detectedAt: new Date(),
        metadata: { predicted: true },
      },
    })
  }

  await prisma.$disconnect()

  return {
    body: {
      success: true,
      predictions: predictions.length,
      logsAnalyzed: logs.length,
    },
  }
}

export { main }
