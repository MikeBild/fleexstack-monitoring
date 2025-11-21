const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main(args) {
  const issues = []
  const since = new Date(Date.now() - 5 * 60 * 1000)

  // Check error rate
  const [errors, total] = await Promise.all([
    prisma.logEntry.count({
      where: { level: { in: ['error', 'fatal'] }, timestamp: { gte: since } },
    }),
    prisma.logEntry.count({
      where: { timestamp: { gte: since } },
    }),
  ])

  const errorRate = total > 0 ? errors / total : 0

  if (errorRate > 0.05) {
    issues.push({
      type: 'high-error-rate',
      severity: 'high',
      title: `High error rate: ${(errorRate * 100).toFixed(1)}%`,
      description: `${errors} errors out of ${total} log entries in the last 5 minutes`,
      recommendation: 'Check recent deployments and application logs',
    })
  }

  // Check for repeated errors
  const repeatedErrors = await prisma.logEntry.groupBy({
    by: ['message'],
    where: {
      level: { in: ['error', 'fatal'] },
      timestamp: { gte: since },
    },
    _count: { message: true },
    having: { message: { _count: { gt: 5 } } },
  })

  for (const error of repeatedErrors) {
    issues.push({
      type: 'repeated-error',
      severity: 'medium',
      title: `Repeated error: ${error.message.substring(0, 50)}...`,
      description: `Error occurred ${error._count.message} times in the last 5 minutes`,
      recommendation: 'Investigate root cause of repeated error',
    })
  }

  // Store issues
  for (const issue of issues) {
    await prisma.logIssue.create({
      data: {
        ...issue,
        source: 'issue-detector',
        detectedAt: new Date(),
        metadata: {},
      },
    })
  }

  await prisma.$disconnect()

  return {
    body: {
      success: true,
      issuesDetected: issues.length,
      errorRate: (errorRate * 100).toFixed(2) + '%',
    },
  }
}

exports.main = main
