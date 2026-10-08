import { get } from '@vercel/global-config'

/**
 * The two content sources the storefront can read from. Both point at an
 * identical dataset shape hosted as static JSON — one generated from Sanity,
 * one from Contentful.
 */
export type ContentSource = 'sanity' | 'contentful'

export const CONTENT_SOURCES: readonly ContentSource[] = ['sanity', 'contentful']

/**
 * Fallback used whenever the active source is unset/unknown/unreachable.
 * Configurable per deployment via `CONTENT_SOURCE_DEFAULT` (`sanity` | `contentful`);
 * defaults to Sanity.
 */
export const DEFAULT_CONTENT_SOURCE: ContentSource = isContentSource(process.env.CONTENT_SOURCE_DEFAULT)
  ? process.env.CONTENT_SOURCE_DEFAULT
  : 'sanity'

/**
 * Global Config key holding the currently active content source. Override with
 * `VERCEL_EDGE_CONFIG_ITEM_KEY` so several demos can share one store, each
 * with its own key.
 */
export const ACTIVE_CONTENT_SOURCE_KEY = process.env.VERCEL_EDGE_CONFIG_ITEM_KEY || 'activeContentSource'

export function isContentSource(value: unknown): value is ContentSource {
  return value === 'sanity' || value === 'contentful'
}

/**
 * Read the active content source from Vercel Edge Config.
 *
 * SERVER-SIDE ONLY. In SSR mode `fetchJsonData` runs on every request (the
 * `memoize` helper is a no-op outside SSG), so this is read fresh per request
 * and flipping the toggle takes effect on the next page load — no redeploy.
 *
 * Degrades gracefully to {@link DEFAULT_CONTENT_SOURCE} when Edge Config is not
 * configured (e.g. local dev without an `EDGE_CONFIG` connection string) or is
 * unreachable, so the storefront never breaks on a missing/unhealthy store.
 */
// Short in-process cache. A single page render calls this many times (once per
// data file); the cache collapses those into ~one network read and bounds how
// stale a just-switched source can be to CACHE_TTL_MS.
const CACHE_TTL_MS = 300
let sourceCache: { value: ContentSource; expiresAt: number } | null = null

export async function getActiveContentSource(): Promise<ContentSource> {
  // Dev/debug escape hatch: force a source without Edge Config (e.g. local dev,
  // or to reproduce a dataset locally). Takes precedence over Edge Config.
  if (isContentSource(process.env.CONTENT_SOURCE_OVERRIDE)) {
    return process.env.CONTENT_SOURCE_OVERRIDE
  }

  if (sourceCache && Date.now() < sourceCache.expiresAt) {
    return sourceCache.value
  }

  const value = await readActiveContentSource()
  sourceCache = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

async function readActiveContentSource(): Promise<ContentSource> {
  // Prefer the strongly-consistent management API so a just-written switch is
  // visible on the very next render. The Edge Config *read* replicas (what the
  // SDK hits) lag several seconds behind a write, which is what made switches
  // take a few refreshes to appear.
  const authoritative = await readFromManagementApi()
  if (authoritative) {
    return authoritative
  }

  // Fallback: eventually-consistent SDK read (no API token configured).
  if (process.env.GLOBAL_CONFIG || process.env.EDGE_CONFIG) {
    try {
      const value = await get(ACTIVE_CONTENT_SOURCE_KEY)
      if (isContentSource(value)) {
        return value
      }
    } catch (error) {
      console.error(`Cannot read "${ACTIVE_CONTENT_SOURCE_KEY}" from Edge Config`, error)
    }
  }

  return DEFAULT_CONTENT_SOURCE
}

async function readFromManagementApi(): Promise<ContentSource | null> {
  const edgeConfigId = process.env.VERCEL_EDGE_CONFIG_ID
  const token = process.env.VERCEL_API_TOKEN
  if (!edgeConfigId || !token) {
    return null
  }

  const itemKey = ACTIVE_CONTENT_SOURCE_KEY
  const url = new URL(`https://api.vercel.com/v1/global-config/${edgeConfigId}/item/${itemKey}`)
  if (process.env.VERCEL_TEAM_ID) {
    url.searchParams.set('teamId', process.env.VERCEL_TEAM_ID)
  }

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    })
    if (!res.ok) {
      return null
    }
    const data: unknown = await res.json()
    // The endpoint returns the item object `{ key, value }`; be tolerant of a
    // bare value too.
    const value =
      data && typeof data === 'object' && 'value' in data ? (data as { value: unknown }).value : data
    return isContentSource(value) ? value : null
  } catch (error) {
    console.error('Cannot read active content source from the Vercel API', error)
    return null
  }
}

/**
 * Base URL of the JSON dataset for a given content source.
 * - `sanity`     → `NEXT_PUBLIC_JSON_DATA_FOLDER` (the pre-existing value)
 * - `contentful` → `NEXT_PUBLIC_JSON_DATA_FOLDER_CONTENTFUL`
 *
 * Falls back to the Sanity/base folder when the Contentful URL is not set, so a
 * misconfiguration renders the default dataset rather than nothing.
 */
export function getContentSourceBaseUrl(source: ContentSource): string | undefined {
  if (source === 'contentful') {
    return process.env.NEXT_PUBLIC_JSON_DATA_FOLDER_CONTENTFUL || process.env.NEXT_PUBLIC_JSON_DATA_FOLDER
  }

  return process.env.NEXT_PUBLIC_JSON_DATA_FOLDER
}

/** Base URL of the JSON dataset for the currently active content source. */
export async function getActiveJsonDataFolder(): Promise<string | undefined> {
  return getContentSourceBaseUrl(await getActiveContentSource())
}
