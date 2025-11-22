export async function main(event, context) {
  const now = new Date()
  const minute = now.getMinutes()
  const hour = now.getHours()

  console.log(`[scheduler] Started at ${now.toISOString()}`)
  console.log(`[scheduler] Time: ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} UTC`)
  console.log(`[scheduler] Event:`, JSON.stringify(event || {}))
  console.log(`[scheduler] Namespace: ${process.env.__OW_NAMESPACE || 'not set'}`)
  console.log(`[scheduler] API Host: ${process.env.__OW_API_HOST ? 'configured' : 'not set'}`)
  console.log(`[scheduler] API Key: ${process.env.__OW_API_KEY ? 'configured' : 'not set'}`)

  const scheduled = []
  if (minute % 5 === 0) scheduled.push('collect-logs')
  if (minute % 15 === 0) scheduled.push('analyze-logs')
  if (minute % 15 === 5) scheduled.push('detect-issues')
  if (minute === 0 || minute === 5) scheduled.push('predict-issues')
  if (hour === 8 && (minute === 0 || minute === 5)) scheduled.push('send-digest')
  if (hour === 2 && (minute === 0 || minute === 5)) scheduled.push('cleanup-data')
  if (minute % 15 === 0) scheduled.push('fleexstack-sample-app-bump-version-monitor')

  console.log(`[scheduler] Functions to invoke: ${scheduled.length > 0 ? scheduled.join(', ') : 'none'}`)

  const results = []
  for (const fn of scheduled) {
    const result = await invokeFunction(fn)
    results.push(result)
  }

  console.log(`[scheduler] Results:`, JSON.stringify(results))
  console.log(`[scheduler] Completed successfully`)

  return {
    body: {
      success: true,
      timestamp: now.toISOString(),
      scheduled,
      invoked: results,
    },
  }
}

async function invokeFunction(functionName) {
  const namespace = process.env.__OW_NAMESPACE
  const apiHost = process.env.__OW_API_HOST

  if (!apiHost || !namespace) {
    console.log(`[scheduler] Skipping ${functionName} (no API host/namespace)`)
    return { function: functionName, status: 'skipped', reason: 'no host/namespace' }
  }

  const url = `${apiHost}/api/v1/web/${namespace}/monitoring/${functionName}`

  try {
    console.log(`[scheduler] Invoking ${functionName} via ${url}`)
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })

    const result = await response.json().catch(() => ({}))
    console.log(`[scheduler] ${functionName}: ${response.status}`, JSON.stringify(result))
    return { function: functionName, status: response.status, result }
  } catch (error) {
    console.error(`[scheduler] Failed ${functionName}:`, error.message)
    return { function: functionName, status: 'error', error: error.message }
  }
}

