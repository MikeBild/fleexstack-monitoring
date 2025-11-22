import pg from 'pg'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
})

export async function main(event, context) {
  const { keywords, limit = 5 } = event
  console.log(`[ai-agent-search-incidents] Keywords: ${keywords}, limit: ${limit}`)

  if (!keywords) {
    console.log('[ai-agent-search-incidents] Error: keywords required')
    return { body: { error: 'keywords parameter required' } }
  }

  let client
  try {
    client = await pool.connect()
    console.log('[ai-agent-search-incidents] Connected to database')

    const { rows } = await client.query(
      `SELECT type, title, "rootCause", recommendation, "resolvedAt"
       FROM "LogIssue"
       WHERE status = 'resolved'
         AND (title ILIKE $1 OR description ILIKE $1 OR "rootCause" ILIKE $1)
       ORDER BY "resolvedAt" DESC
       LIMIT $2`,
      [`%${keywords}%`, limit]
    )

    console.log(`[ai-agent-search-incidents] Found ${rows.length} incidents`)
    return { body: { incidents: rows } }
  } catch (err) {
    console.error(`[ai-agent-search-incidents] Error: ${err.message}`)
    return { body: { error: err.message, incidents: [] } }
  } finally {
    if (client) client.release()
  }
}
