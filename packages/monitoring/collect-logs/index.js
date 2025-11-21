export async function main(event, context) {
  console.log('[collect-logs] Started')
  console.log('[collect-logs] BLUE_HOST:', process.env.BLUE_HOST || 'not set')
  console.log('[collect-logs] GREEN_HOST:', process.env.GREEN_HOST || 'not set')

  try {
    const sources = [
      { name: 'blue', host: process.env.BLUE_HOST },
      { name: 'green', host: process.env.GREEN_HOST },
    ]

    const results = []
    const since = new Date(Date.now() - 5 * 60 * 1000)

    for (const source of sources) {
      if (!source.host) {
        console.log(`[collect-logs] ${source.name}: Host not configured`)
        results.push({ source: source.name, error: 'Host not configured' })
        continue
      }

      try {
        const url = `http://${source.host}:3000/api/logs?since=${since.toISOString()}`
        console.log(`[collect-logs] Fetching ${source.name}: ${url}`)

        const response = await fetch(url, {
          signal: AbortSignal.timeout(10000),
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = await response.json()
        const logs = Array.isArray(data) ? data : (data.logs || [])
        console.log(`[collect-logs] ${source.name}: response type=${typeof data}, isArray=${Array.isArray(data)}, collected ${logs.length} logs`)

        results.push({
          source: source.name,
          collected: logs.length,
          stored: 0,
        })
      } catch (error) {
        console.error(`[collect-logs] ${source.name}: ${error.message}`)
        results.push({
          source: source.name,
          error: error.message,
        })
      }
    }

    console.log('[collect-logs] Completed:', JSON.stringify(results))

    return {
      body: {
        success: true,
        timestamp: new Date().toISOString(),
        results,
      },
    }
  } catch (error) {
    console.error('[collect-logs] Fatal error:', error.message)
    return {
      body: {
        success: false,
        error: error.message,
      },
    }
  }
}
