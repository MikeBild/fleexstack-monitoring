import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3'

const getGitHubHeaders = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/vnd.github.v3+json',
  'User-Agent': 'Fleexstack-Monitoring-Bot',
})

export async function main(event, context) {
  console.log('[sync-docs-to-spaces] Started')

  const repo = process.env.DOCS_REPO || 'MikeBild/fleexstack'
  const docsPath = process.env.DOCS_PATH || 'docs'
  const token = process.env.GH_TOKEN
  const bucket = process.env.SPACES_BUCKET || 'fleexstack-docs'
  const region = process.env.SPACES_REGION || 'fra1'

  if (!token) {
    console.error('[sync-docs-to-spaces] GH_TOKEN not configured')
    return { body: { error: 'GH_TOKEN required' } }
  }

  if (!process.env.SPACES_ACCESS_KEY_ID || !process.env.SPACES_SECRET_ACCESS_KEY) {
    console.error('[sync-docs-to-spaces] Spaces credentials not configured')
    return { body: { error: 'SPACES_ACCESS_KEY_ID and SPACES_SECRET_ACCESS_KEY required' } }
  }

  const s3 = new S3Client({
    endpoint: `https://${region}.digitaloceanspaces.com`,
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.SPACES_ACCESS_KEY_ID,
      secretAccessKey: process.env.SPACES_SECRET_ACCESS_KEY,
    },
  })

  const headers = getGitHubHeaders(token)

  try {
    // Get docs directory contents from GitHub
    const contentsUrl = `https://api.github.com/repos/${repo}/contents/${docsPath}`
    console.log(`[sync-docs-to-spaces] Fetching: ${contentsUrl}`)

    const response = await fetch(contentsUrl, { headers })
    if (!response.ok) {
      const error = await response.text()
      console.error(`[sync-docs-to-spaces] GitHub API error: ${response.status}`, error)
      return { body: { error: `GitHub API error: ${response.status}` } }
    }

    const contents = await response.json()
    const files = contents.filter(item => item.type === 'file' && item.name.endsWith('.md'))

    console.log(`[sync-docs-to-spaces] Found ${files.length} markdown files`)

    let synced = 0
    for (const file of files) {
      // Fetch file content
      const fileResponse = await fetch(file.download_url)
      if (!fileResponse.ok) {
        console.error(`[sync-docs-to-spaces] Failed to fetch: ${file.name}`)
        continue
      }

      const content = await fileResponse.text()

      // Upload to Spaces
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: `docs/${file.name}`,
        Body: content,
        ContentType: 'text/markdown',
        ACL: 'public-read',
      }))

      console.log(`[sync-docs-to-spaces] Synced: ${file.name}`)
      synced++
    }

    console.log(`[sync-docs-to-spaces] Completed: ${synced} files synced`)

    return {
      body: {
        success: true,
        synced,
        bucket,
        region,
      },
    }
  } catch (err) {
    console.error(`[sync-docs-to-spaces] Error: ${err.message}`)
    return { body: { error: err.message } }
  }
}
