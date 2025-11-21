import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main(args) {
  const sources = [
    { name: 'blue', host: process.env.BLUE_HOST },
    { name: 'green', host: process.env.GREEN_HOST },
  ]

  const results = []
  const since = new Date(Date.now() - 5 * 60 * 1000)

  for (const source of sources) {
    if (!source.host) {
      results.push({ source: source.name, error: 'Host not configured' })
      continue
    }

    try {
      const response = await fetch(`http://${source.host}:3000/api/logs?since=${since.toISOString()}`, {
        timeout: 10000,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const logs = await response.json()

      if (logs.length > 0) {
        const stored = await prisma.logEntry.createMany({
          data: logs.map(log => ({
            timestamp: new Date(log.timestamp),
            level: log.level,
            message: log.message,
            source: source.name,
            metadata: log.metadata || {},
            analyzed: false,
          })),
          skipDuplicates: true,
        })

        results.push({
          source: source.name,
          collected: logs.length,
          stored: stored.count,
        })
      } else {
        results.push({
          source: source.name,
          collected: 0,
          stored: 0,
        })
      }
    } catch (error) {
      results.push({
        source: source.name,
        error: error.message,
      })
    }
  }

  await prisma.$disconnect()

  return {
    body: {
      success: true,
      timestamp: new Date().toISOString(),
      results,
    },
  }
}

export { main }
