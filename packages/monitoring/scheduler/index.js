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
  if ([5, 20, 35, 50].includes(minute)) scheduled.push('detect-issues')
  if (minute === 0) scheduled.push('predict-issues')
  if (hour === 8 && minute === 0) scheduled.push('send-digest')
  if (hour === 2 && minute === 0) scheduled.push('cleanup-data')

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
  const apiKey = process.env.__OW_API_KEY

  if (!apiHost || !apiKey) {
    console.log(`Skipping ${functionName} (no API credentials)`)
    return { function: functionName, status: 'skipped', reason: 'no credentials' }
  }

  const url = `${apiHost}/api/v1/namespaces/${namespace}/actions/monitoring/${functionName}?blocking=false`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(apiKey).toString('base64')}`,
      },
      body: '{}',
    })

    console.log(`Invoked ${functionName}: ${response.status}`)
    return { function: functionName, status: response.status }
  } catch (error) {
    console.error(`Failed to invoke ${functionName}:`, error.message)
    return { function: functionName, status: 'error', error: error.message }
  }
}

