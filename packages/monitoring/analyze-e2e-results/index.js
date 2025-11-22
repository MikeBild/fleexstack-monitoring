import pg from 'pg'
import crypto from 'crypto'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
})

export async function main(event, context) {
  console.log('[analyze-e2e-results] Started')
  console.log('[analyze-e2e-results] Event keys:', Object.keys(event))

  // Handle both direct body and nested body from web invocation
  let body = event
  if (event.body) {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
  }

  const {
    workflowRun,
    environment,
    version,
    commitSha,
    results = {},
    timestamp = new Date().toISOString(),
  } = body

  console.log('[analyze-e2e-results] Parsed - allPassed:', results.allPassed)

  console.log(`[analyze-e2e-results] Workflow: ${workflowRun}, Environment: ${environment}, Version: ${version}`)

  const client = await pool.connect()
  try {
    // Store E2E result as a log entry for historical tracking
    const logId = crypto.randomUUID()
    await client.query(
      `INSERT INTO "LogEntry" (id, timestamp, level, message, source, hostname, metadata, analyzed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        logId,
        timestamp,
        results.allPassed ? 'info' : 'error',
        `E2E verification ${results.allPassed ? 'passed' : 'failed'} for ${environment} v${version}`,
        'e2e-verification',
        'github-actions',
        JSON.stringify({
          workflowRun,
          environment,
          version,
          commitSha,
          results,
        }),
        true, // Mark as analyzed since we're handling it here
      ]
    )

    // If all tests passed, just record success
    if (results.allPassed) {
      console.log('[analyze-e2e-results] All E2E tests passed')
      return {
        body: {
          success: true,
          status: 'passed',
          issuesCreated: 0,
        },
      }
    }

    // Analyze failures with GenAI
    let issuesCreated = 0
    const failures = extractFailures(results)
    console.log(`[analyze-e2e-results] Found ${failures.length} failures`)

    if (failures.length > 0 && process.env.GENAI_AGENT_URL) {
      try {
        const baseUrl = process.env.GENAI_AGENT_URL.replace(/\/$/, '')
        const genaiUrl = `${baseUrl}/api/v1/chat/completions`

        const requestBody = {
          messages: [
            {
              role: 'system',
              content: `You are an E2E deployment verification analyst for FleexStack.

IMPORTANT: Use available functions to provide context-aware recommendations:
- get_runbook(issue_type) - retrieve remediation steps for: e2e-health-check-failure, e2e-version-mismatch, e2e-webhook-failure, e2e-haproxy-routing, high-error-rate, connection-failure
- search_incidents(keywords) - find similar past resolved incidents
- search_github_issues(keywords) - find closed GitHub issues with resolutions

Analyze the E2E test failures and provide actionable remediation steps.

Return a JSON object with an "issues" array containing objects with:
- type: e2e-health-check-failure | e2e-version-mismatch | e2e-webhook-failure | e2e-haproxy-routing | e2e-endpoint-failure
- severity: low/medium/high/critical
- title: brief summary
- description: what failed and why it matters
- rootCause: likely cause based on failure pattern
- recommendation: specific steps to remediate`,
            },
            {
              role: 'user',
              content: `Analyze these E2E verification failures:

Environment: ${environment}
Expected Version: ${version}
Commit: ${commitSha}

Failures:
${failures.map(f => `- ${f.check}: ${f.message} (${f.details || 'no details'})`).join('\n')}

Full results:
${JSON.stringify(results, null, 2)}`,
            },
          ],
          max_tokens: 2000,
        }

        const headers = { 'Content-Type': 'application/json' }
        if (process.env.GENAI_API_KEY) {
          headers['Authorization'] = `Bearer ${process.env.GENAI_API_KEY}`
        }

        const response = await fetch(genaiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(60000),
        })

        console.log(`[analyze-e2e-results] GenAI response: ${response.status}`)

        if (response.ok) {
          const result = await response.json()
          const content = result.choices?.[0]?.message?.content || ''

          let issues = []
          try {
            let jsonContent = content
              .replace(/^```(?:json)?\s*/i, '')
              .replace(/\s*```$/i, '')
              .trim()

            const jsonMatch = jsonContent.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0])
              issues = parsed.issues || []
            }
          } catch (parseError) {
            console.error('[analyze-e2e-results] Failed to parse GenAI response:', parseError.message)
          }

          for (const issue of issues) {
            await client.query(
              `INSERT INTO "LogIssue" (id, type, severity, title, description, "rootCause", recommendation, source, status, "detectedAt", "updatedAt", metadata, "affectedLogs")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
              [
                crypto.randomUUID(),
                issue.type || 'e2e-failure',
                issue.severity || 'high',
                issue.title || `E2E failure in ${environment}`,
                issue.description || '',
                issue.rootCause || null,
                issue.recommendation || null,
                'e2e-verification',
                'open',
                new Date(),
                new Date(),
                JSON.stringify({
                  workflowRun,
                  environment,
                  version,
                  commitSha,
                  failures,
                }),
                [logId],
              ]
            )
            issuesCreated++
          }
          console.log(`[analyze-e2e-results] Created ${issuesCreated} issues`)
        }
      } catch (error) {
        console.error('[analyze-e2e-results] GenAI failed:', error.message)
      }
    }

    // Create a default issue if GenAI didn't create any
    if (issuesCreated === 0 && failures.length > 0) {
      const primaryFailure = failures[0]
      await client.query(
        `INSERT INTO "LogIssue" (id, type, severity, title, description, "rootCause", recommendation, source, status, "detectedAt", "updatedAt", metadata, "affectedLogs")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          crypto.randomUUID(),
          mapFailureToType(primaryFailure.check),
          'high',
          `E2E verification failed: ${primaryFailure.check}`,
          `${failures.length} check(s) failed during deployment verification of ${environment} v${version}`,
          primaryFailure.message,
          'Check deployment logs and infrastructure status. SSH to affected server for investigation.',
          'e2e-verification',
          'open',
          new Date(),
          new Date(),
          JSON.stringify({
            workflowRun,
            environment,
            version,
            commitSha,
            failures,
          }),
          [logId],
        ]
      )
      issuesCreated = 1
    }

    // Create GitHub issue for critical failures
    if (failures.length > 0 && process.env.ALERTS_REPO && process.env.GH_TOKEN) {
      await createGitHubIssue({
        repo: process.env.ALERTS_REPO,
        token: process.env.GH_TOKEN,
        workflowRun,
        environment,
        version,
        commitSha,
        failures,
        results,
      })
    }

    console.log('[analyze-e2e-results] Completed')

    return {
      body: {
        success: true,
        status: 'failed',
        issuesCreated,
        failures: failures.length,
      },
    }
  } catch (error) {
    console.error('[analyze-e2e-results] Fatal error:', error.message)
    return {
      body: {
        success: false,
        error: error.message,
      },
    }
  } finally {
    client.release()
  }
}

function extractFailures(results) {
  const failures = []

  if (results.blueHealth === 'down') {
    failures.push({ check: 'blue-health', message: 'Blue node health check failed', details: results.blueVersion })
  }
  if (results.greenHealth === 'down') {
    failures.push({ check: 'green-health', message: 'Green node health check failed', details: results.greenVersion })
  }
  if (results.versionVerified === false) {
    failures.push({ check: 'version-mismatch', message: 'Deployed version does not match expected', details: `expected: ${results.expectedVersion}, got: ${results.deployedVersion}` })
  }
  if (results.httpsHealth === false) {
    failures.push({ check: 'https-health', message: 'HTTPS health endpoint failed' })
  }
  if (results.httpsGraphQL === false) {
    failures.push({ check: 'https-graphql', message: 'HTTPS GraphQL endpoint failed' })
  }
  if (results.webhookStatus === false) {
    failures.push({ check: 'webhook', message: 'Webhook endpoint not accessible' })
  }
  if (results.haproxyState === 'error') {
    failures.push({ check: 'haproxy', message: 'HAProxy backend state error', details: results.haproxyDetails })
  }
  if (results.endpointTests?.failed?.length > 0) {
    for (const endpoint of results.endpointTests.failed) {
      failures.push({ check: `endpoint-${endpoint.name}`, message: `Endpoint test failed: ${endpoint.name}`, details: endpoint.error })
    }
  }

  return failures
}

function mapFailureToType(check) {
  const mapping = {
    'blue-health': 'e2e-health-check-failure',
    'green-health': 'e2e-health-check-failure',
    'version-mismatch': 'e2e-version-mismatch',
    'https-health': 'e2e-health-check-failure',
    'https-graphql': 'e2e-endpoint-failure',
    'webhook': 'e2e-webhook-failure',
    'haproxy': 'e2e-haproxy-routing',
  }
  return mapping[check] || 'e2e-failure'
}

async function createGitHubIssue({ repo, token, workflowRun, environment, version, commitSha, failures, results }) {
  console.log(`[analyze-e2e-results] Creating GitHub issue in ${repo}`)

  const [owner, repoName] = repo.split('/')
  const date = new Date().toISOString().split('T')[0]

  const body = `## E2E Verification Failure Report

**Workflow Run:** ${workflowRun}
**Environment:** ${environment}
**Version:** ${version}
**Commit:** ${commitSha}
**Time:** ${new Date().toISOString()}

### Failures

${failures.map(f => `- **${f.check}**: ${f.message}${f.details ? ` (${f.details})` : ''}`).join('\n')}

### Quick Commands

\`\`\`bash
# Check Blue logs
ssh root@209.38.248.218 "journalctl -u fleexstack -f"

# Check Green logs
ssh root@209.38.209.155 "journalctl -u fleexstack -f"

# Restart service
ssh root@209.38.248.218 "systemctl restart fleexstack"
\`\`\`

### Full Results

<details>
<summary>Click to expand</summary>

\`\`\`json
${JSON.stringify(results, null, 2)}
\`\`\`

</details>

---

🤖 Generated by FleexStack Monitoring`

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        title: `🚨 E2E Verification Failed - ${environment} v${version} - ${date}`,
        body,
        labels: ['e2e-failure', 'automated', 'deployment'],
      }),
    })

    if (response.ok) {
      const issue = await response.json()
      console.log(`[analyze-e2e-results] Created GitHub issue #${issue.number}`)
      return issue
    } else {
      const errorText = await response.text()
      console.error(`[analyze-e2e-results] Failed to create GitHub issue: ${response.status} ${errorText}`)
    }
  } catch (error) {
    console.error(`[analyze-e2e-results] GitHub issue creation error: ${error.message}`)
  }

  return null
}
