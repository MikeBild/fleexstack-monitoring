import https from 'https'
import http from 'http'

async function main(args) {
  const now = new Date()
  const minute = now.getMinutes()
  const hour = now.getHours()

  const results = []

  // collect-logs: every 5 minutes
  if (minute % 5 === 0) {
    results.push(await invokeFunction('collect-logs'))
  }

  // analyze-logs: every 15 minutes
  if (minute % 15 === 0) {
    results.push(await invokeFunction('analyze-logs'))
  }

  // detect-issues: at minutes 5, 20, 35, 50
  if ([5, 20, 35, 50].includes(minute)) {
    results.push(await invokeFunction('detect-issues'))
  }

  // predict-issues: hourly at minute 0
  if (minute === 0) {
    results.push(await invokeFunction('predict-issues'))
  }

  // send-digest: daily at 8:00 AM
  if (hour === 8 && minute === 0) {
    results.push(await invokeFunction('send-digest'))
  }

  // cleanup-data: daily at 2:00 AM
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
    console.log(`Invoking ${functionName} (local mode)`)
    return { function: functionName, status: 'skipped', reason: 'local mode' }
  }

  const url = `${apiHost}/api/v1/namespaces/${namespace}/actions/monitoring/${functionName}?blocking=false`

  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http
    const auth = Buffer.from(apiKey).toString('base64')

    const req = protocol.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
      },
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        console.log(`Invoked ${functionName}: ${res.statusCode}`)
        resolve({ function: functionName, status: res.statusCode })
      })
    })

    req.on('error', (err) => {
      console.error(`Failed to invoke ${functionName}:`, err.message)
      resolve({ function: functionName, status: 'error', error: err.message })
    })

    req.write('{}')
    req.end()
  })
}

export { main }
