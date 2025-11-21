const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main(args) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours

  // Gather statistics
  const [totalLogs, errorLogs, issues, resolvedIssues] = await Promise.all([
    prisma.logEntry.count({ where: { timestamp: { gte: since } } }),
    prisma.logEntry.count({
      where: { level: { in: ['error', 'fatal'] }, timestamp: { gte: since } },
    }),
    prisma.logIssue.count({
      where: { detectedAt: { gte: since }, status: { not: 'resolved' } },
    }),
    prisma.logIssue.count({
      where: { resolvedAt: { gte: since } },
    }),
  ])

  const errorRate = totalLogs > 0 ? ((errorLogs / totalLogs) * 100).toFixed(2) : 0

  // Create digest content
  const digest = {
    date: new Date().toISOString().split('T')[0],
    summary: {
      totalLogs,
      errorLogs,
      errorRate: `${errorRate}%`,
      openIssues: issues,
      resolvedIssues,
    },
  }

  // TODO: Send digest via email or GitHub issue
  // For now, just log it
  console.log('Daily Digest:', JSON.stringify(digest, null, 2))

  await prisma.$disconnect()

  return {
    body: {
      success: true,
      digest,
    },
  }
}

exports.main = main
