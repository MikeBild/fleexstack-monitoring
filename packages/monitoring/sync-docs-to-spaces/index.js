import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const getGitHubHeaders = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/vnd.github.v3+json',
  'User-Agent': 'Fleexstack-Monitoring-Bot',
})

async function fetchFilesRecursively(repo, path, headers) {
  const files = []
  const url = `https://api.github.com/repos/${repo}/contents/${path}`

  const response = await fetch(url, { headers })
  if (!response.ok) {
    console.error(`[sync-docs-to-spaces] Failed to fetch: ${path}`)
    return files
  }

  const contents = await response.json()

  for (const item of contents) {
    if (item.type === 'file') {
      files.push({
        name: item.name,
        path: item.path,
        download_url: item.download_url,
      })
    } else if (item.type === 'dir') {
      const subFiles = await fetchFilesRecursively(repo, item.path, headers)
      files.push(...subFiles)
    }
  }

  return files
}

export async function main(event, context) {
  console.log('[sync-docs-to-spaces] Started')

  const repo = process.env.DOCS_REPO || 'MikeBild/fleexstack'
  const docsPath = process.env.DOCS_PATH || 'docs'
  const token = process.env.GH_TOKEN
  const bucket = process.env.SPACES_BUCKET || 'fleexstack-monitoring'
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
    console.log(`[sync-docs-to-spaces] Fetching files recursively from: ${repo}/${docsPath}`)

    const allFiles = await fetchFilesRecursively(repo, docsPath, headers)
    console.log(`[sync-docs-to-spaces] Found ${allFiles.length} files total`)

    let synced = 0
    for (const file of allFiles) {
      const fileResponse = await fetch(file.download_url)
      if (!fileResponse.ok) {
        console.error(`[sync-docs-to-spaces] Failed to fetch: ${file.path}`)
        continue
      }

      const content = await fileResponse.text()
      const contentType = file.name.endsWith('.md') ? 'text/markdown' :
                         file.name.endsWith('.json') ? 'application/json' :
                         file.name.endsWith('.yml') || file.name.endsWith('.yaml') ? 'text/yaml' :
                         'text/plain'

      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: file.path,
        Body: content,
        ContentType: contentType,
        ACL: 'public-read',
      }))

      console.log(`[sync-docs-to-spaces] Synced: ${file.path}`)
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
