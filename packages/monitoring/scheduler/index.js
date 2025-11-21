export async function main(event, context) {
  const now = new Date()
  const minute = now.getMinutes()
  const hour = now.getHours()

  const results = []

  if (minute % 5 === 0) {
    results.push(await invokeFunction('collect-logs'))
  }

  if (minute % 15 === 0) {
    results.push(await invokeFunction('analyze-logs'))
  }

  if ([5, 20, 35, 50].includes(minute)) {
    results.push(await invokeFunction('detect-issues'))
  }

  if (minute === 0) {
    results.push(await invokeFunction('predict-issues'))
  }

  if (hour === 8 && minute === 0) {
    results.push(await invokeFunction('send-digest'))
  }

  if (hour === 2 && minute === 0) {
    results.push(await invokeFunction('cleanup-data'))
  }

  return {
    body: {
      success: true,
      timestamp: now.toISOString(),
      invoked: results.filter(r => r !== null),
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

