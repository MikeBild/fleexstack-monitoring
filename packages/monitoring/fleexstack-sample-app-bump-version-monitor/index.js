export async function main(event, context) {
  console.log('[bump-version] Started')

  const ghToken = process.env.GH_TOKEN
  if (!ghToken) {
    console.error('[bump-version] GH_TOKEN not configured')
    return {
      body: { success: false, error: 'GH_TOKEN not configured' },
    }
  }

  const owner = 'MikeBild'
  const repo = 'fleexstack-sample-app'
  const path = 'package.json'

  try {
    // Get current package.json
    const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`
    console.log(`[bump-version] Fetching ${getUrl}`)

    const getResponse = await fetch(getUrl, {
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Fleexstack-Monitoring-Bot',
      },
    })

    if (!getResponse.ok) {
      const error = await getResponse.text()
      console.error(`[bump-version] Failed to get package.json: ${getResponse.status}`, error)
      return {
        body: { success: false, error: `Failed to get package.json: ${getResponse.status}` },
      }
    }

    const fileData = await getResponse.json()
    const content = Buffer.from(fileData.content, 'base64').toString('utf-8')
    const packageJson = JSON.parse(content)

    const fromVersion = packageJson.version
    console.log(`[bump-version] Current version: ${fromVersion}`)

    // Increment patch version
    const versionParts = fromVersion.split('.')
    const major = parseInt(versionParts[0]) || 0
    const minor = parseInt(versionParts[1]) || 0
    const patch = parseInt(versionParts[2]) || 0
    const toVersion = `${major}.${minor}.${patch + 1}`

    packageJson.version = toVersion
    console.log(`[bump-version] New version: ${toVersion}`)

    // Commit the change
    const newContent = Buffer.from(JSON.stringify(packageJson, null, 2) + '\n').toString('base64')
    const commitMessage = `Automated by Fleexstack monitoring bot. ${fromVersion} to ${toVersion}`

    const putResponse = await fetch(getUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Fleexstack-Monitoring-Bot',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: commitMessage,
        content: newContent,
        sha: fileData.sha,
      }),
    })

    if (!putResponse.ok) {
      const error = await putResponse.text()
      console.error(`[bump-version] Failed to commit: ${putResponse.status}`, error)
      return {
        body: { success: false, error: `Failed to commit: ${putResponse.status}` },
      }
    }

    const result = await putResponse.json()
    console.log(`[bump-version] Committed: ${result.commit.sha}`)
    console.log(`[bump-version] Completed: ${fromVersion} -> ${toVersion}`)

    return {
      body: {
        success: true,
        fromVersion,
        toVersion,
        commitSha: result.commit.sha,
        commitUrl: result.commit.html_url,
      },
    }
  } catch (error) {
    console.error('[bump-version] Error:', error.message)
    return {
      body: { success: false, error: error.message },
    }
  }
}
