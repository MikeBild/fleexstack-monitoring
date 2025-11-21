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
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const logs = await response.json()

      // TODO: Store logs in database
      results.push({
        source: source.name,
        collected: logs.length,
        stored: 0,
      })
    } catch (error) {
      results.push({
        source: source.name,
        error: error.message,
      })
    }
  }

  return {
    body: {
      success: true,
      timestamp: new Date().toISOString(),
      results,
    },
  }
}

export { main }
