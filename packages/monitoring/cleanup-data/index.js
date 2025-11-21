import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main(args) {
  const logRetentionDays = parseInt(process.env.LOG_RETENTION_DAYS || '30')
  const issueRetentionDays = 90

  const logCutoff = new Date(Date.now() - logRetentionDays * 24 * 60 * 60 * 1000)
  const issueCutoff = new Date(Date.now() - issueRetentionDays * 24 * 60 * 60 * 1000)

  const deletedLogs = await prisma.logEntry.deleteMany({
    where: {
      timestamp: { lt: logCutoff },
    },
  })

  const deletedIssues = await prisma.logIssue.deleteMany({
    where: {
      status: 'resolved',
      resolvedAt: { lt: issueCutoff },
    },
  })

  await prisma.$disconnect()

  return {
    body: {
      success: true,
      deletedLogs: deletedLogs.count,
      deletedIssues: deletedIssues.count,
      retentionDays: {
        logs: logRetentionDays,
        issues: issueRetentionDays,
      },
    },
  }
}

export { main }
