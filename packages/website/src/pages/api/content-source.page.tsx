import { ACTIVE_CONTENT_SOURCE_KEY, getActiveContentSource, isContentSource } from '#utils/contentSource'
import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * Content-source API.
 *
 * GET  → `{ source }` — the currently active content source (read from Edge Config).
 * POST → `{ source }` in the body switches the active source. The write goes to
 *        Edge Config via the Vercel REST API (Edge Config reads use the SDK, but
 *        writes require an API token). Guarded by an optional shared secret.
 *
 * `.page.tsx` extension is required: `pageExtensions` in next.config.js only
 * registers `page.tsx` / `page-ssr.tsx`, so a plain `.ts` API route is ignored.
 */

type Data =
  | { source: 'sanity' | 'contentful' }
  | { error: string; detail?: string }

const ADMIN_SECRET = process.env.CONTENT_SOURCE_ADMIN_SECRET

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>): Promise<void> {
  // Never cache the active-source lookup or the switch response.
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET') {
    res.status(200).json({ source: await getActiveContentSource() })
    return
  }

  if (req.method === 'POST') {
    // When the on-store switcher is baked into the deployment
    // (NEXT_PUBLIC_SHOW_CONTENT_SWITCHER=on), writes are open — the deployment
    // itself is the gate and the switcher carries no secret. Otherwise fall
    // back to the shared-secret gate (used by the standalone /admin page): when
    // CONTENT_SOURCE_ADMIN_SECRET is set, the caller must supply it (query
    // `?secret=` or `x-admin-secret` header).
    const switcherEnabled = process.env.NEXT_PUBLIC_SHOW_CONTENT_SWITCHER === 'on'
    if (!switcherEnabled && ADMIN_SECRET) {
      const provided = req.headers['x-admin-secret'] ?? req.query.secret
      if (provided !== ADMIN_SECRET) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
    }

    const source = typeof req.body === 'string' ? safeParseSource(req.body) : req.body?.source
    if (!isContentSource(source)) {
      res.status(400).json({ error: 'Invalid "source". Expected "sanity" or "contentful".' })
      return
    }

    const edgeConfigId = process.env.VERCEL_EDGE_CONFIG_ID
    const token = process.env.VERCEL_API_TOKEN
    const itemKey = ACTIVE_CONTENT_SOURCE_KEY
    const teamId = process.env.VERCEL_TEAM_ID

    if (!edgeConfigId || !token) {
      res.status(500).json({
        error: 'Edge Config write is not configured (missing VERCEL_EDGE_CONFIG_ID and/or VERCEL_API_TOKEN).'
      })
      return
    }

    const url = new URL(`https://api.vercel.com/v1/global-config/${edgeConfigId}/items`)
    if (teamId) {
      url.searchParams.set('teamId', teamId)
    }

    try {
      const response = await fetch(url.toString(), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: [{ operation: 'upsert', key: itemKey, value: source }]
        })
      })

      if (!response.ok) {
        const detail = await response.text()
        console.error('Failed to update Edge Config', response.status, detail)
        res.status(502).json({ error: 'Failed to update Edge Config', detail })
        return
      }

      res.status(200).json({ source })
    } catch (error) {
      console.error('Failed to reach the Vercel API', error)
      res.status(502).json({ error: 'Failed to reach the Vercel API' })
    }
    return
  }

  res.setHeader('Allow', 'GET, POST')
  res.status(405).json({ error: 'Method not allowed' })
}

function safeParseSource(body: string): unknown {
  try {
    return JSON.parse(body)?.source
  } catch {
    return undefined
  }
}
