const getGitHubHeaders = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/vnd.github.v3+json',
  'User-Agent': 'Fleexstack-Monitoring-Bot',
})

export async function main(event, context) {
  const { keywords, limit = 5 } = event
  console.log(`[ai-agent-search-github-issues] Keywords: ${keywords}, limit: ${limit}`)

  if (!keywords) {
    return { body: { error: 'keywords parameter required' } }
  }

  const repo = process.env.ALERTS_REPO
  const token = process.env.GH_TOKEN

  if (!repo || !token) {
    console.log('[ai-agent-search-github-issues] ALERTS_REPO or GH_TOKEN not configured')
    return { body: { issues: [], message: 'GitHub not configured' } }
  }

  const headers = getGitHubHeaders(token)

  try {
    const query = encodeURIComponent(`repo:${repo} is:issue is:closed ${keywords}`)
    const url = `https://api.github.com/search/issues?q=${query}&per_page=${limit}&sort=updated&order=desc`

    console.log(`[ai-agent-search-github-issues] Searching: ${url}`)

    const response = await fetch(url, { headers })

    if (!response.ok) {
      const error = await response.text()
      console.error(`[ai-agent-search-github-issues] GitHub API error: ${response.status}`, error)
      return { body: { error: `GitHub API error: ${response.status}`, issues: [] } }
    }

    const data = await response.json()
    console.log(`[ai-agent-search-github-issues] Found ${data.total_count} issues`)

    const issues = await Promise.all(
      data.items.slice(0, limit).map(async (issue) => {
        let resolution = null
        try {
          const commentsRes = await fetch(issue.comments_url, { headers })
          if (commentsRes.ok) {
            const comments = await commentsRes.json()
            if (comments.length > 0) {
              resolution = comments[comments.length - 1].body
            }
          }
        } catch (err) {
          console.log(`[ai-agent-search-github-issues] Failed to fetch comments: ${err.message}`)
        }

        return {
          number: issue.number,
          title: issue.title,
          body: issue.body?.substring(0, 500) || '',
          labels: issue.labels.map(l => l.name),
          closedAt: issue.closed_at,
          url: issue.html_url,
          resolution,
        }
      })
    )

    console.log(`[ai-agent-search-github-issues] Returning ${issues.length} issues with context`)
    return { body: { issues } }
  } catch (err) {
    console.error(`[ai-agent-search-github-issues] Error: ${err.message}`)
    return { body: { error: err.message, issues: [] } }
  }
}
