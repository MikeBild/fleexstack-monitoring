import fs from 'fs'
import path from 'path'

export async function main(event, context) {
  const { issue_type } = event
  console.log(`[ai-agent-get-runbook] Requested: ${issue_type}`)

  if (!issue_type) {
    console.log('[ai-agent-get-runbook] Error: issue_type required')
    return { body: { error: 'issue_type parameter required' } }
  }

  try {
    const runbookPath = path.join(process.cwd(), 'knowledge', 'runbooks', `${issue_type}.md`)
    console.log(`[ai-agent-get-runbook] Looking for: ${runbookPath}`)

    if (fs.existsSync(runbookPath)) {
      const content = fs.readFileSync(runbookPath, 'utf-8')
      console.log(`[ai-agent-get-runbook] Found runbook: ${content.length} chars`)
      return { body: { runbook: content } }
    }

    console.log(`[ai-agent-get-runbook] Not found: ${issue_type}`)
    return { body: { runbook: null, message: `No runbook for ${issue_type}` } }
  } catch (err) {
    console.error(`[ai-agent-get-runbook] Error: ${err.message}`)
    return { body: { error: err.message } }
  }
}
