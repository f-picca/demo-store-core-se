import { useCallback, useEffect, useState, type CSSProperties } from 'react'

/**
 * Floating switcher shown ON the storefront so the content source
 * (Sanity ⇄ Contentful) can be flipped without leaving the store.
 *
 * Enabled per deployment by a baked build flag: `NEXT_PUBLIC_SHOW_CONTENT_SWITCHER=on`.
 * No secret in the URL, nothing to type — it's simply present on deployments
 * where the flag is set (the demo deployments) and absent everywhere else. The
 * write credential (Vercel API token) stays server-side; the client only calls
 * our own /api/content-source route.
 *
 * Self-contained (local types, inline styles, no import from the server-only
 * content-source util) so the Edge Config SDK never enters the client bundle.
 */

type ContentSource = 'sanity' | 'contentful'

const ENABLED = process.env.NEXT_PUBLIC_SHOW_CONTENT_SWITCHER === 'on'

const SOURCES: { id: ContentSource; label: string; color: string }[] = [
  { id: 'sanity', label: 'Sanity', color: '#F03E2F' },
  { id: 'contentful', label: 'Contentful', color: '#2478CC' }
]

/**
 * Poll the read endpoint until it reports `target` (Edge Config propagation),
 * so we only reload once the storefront will actually render the new source.
 * Cache-busted + no-store so no layer serves a stale answer. Gives up after
 * ~4.5s and lets the caller reload anyway.
 */
async function waitForSource(target: ContentSource): Promise<void> {
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch(`/api/content-source?_=${Date.now()}`, { cache: 'no-store' })
      const data = await res.json()
      if (data?.source === target) return
    } catch {
      /* transient — keep polling */
    }
    await new Promise(resolve => setTimeout(resolve, 300))
  }
}

export const ContentSourceSwitcher = () => {
  const [active, setActive] = useState<ContentSource | null>(null)
  const [busy, setBusy] = useState<ContentSource | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!ENABLED) return
    fetch('/api/content-source', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (data?.source === 'sanity' || data?.source === 'contentful') setActive(data.source)
      })
      .catch(() => {})
  }, [])

  const switchTo = useCallback(
    async (source: ContentSource) => {
      if (busy || source === active) return
      setBusy(source)
      setError(false)
      try {
        const res = await fetch('/api/content-source', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source })
        })
        if (!res.ok) throw new Error(String(res.status))
        // Reloading right away can render the old source (needing a second
        // refresh). Poll the read endpoint until it reflects the new source,
        // then give the page function's short read-cache a moment to expire,
        // then reload once — so a single click sticks.
        await waitForSource(source)
        await new Promise(resolve => setTimeout(resolve, 400))
        window.location.reload()
      } catch {
        setBusy(null)
        setError(true)
      }
    },
    [busy, active]
  )

  if (!ENABLED) return null

  return (
    <div style={styles.wrap} role="group" aria-label="Content source switcher">
      <span style={styles.label}>Source</span>
      {SOURCES.map(({ id, label, color }) => {
        const isActive = active === id
        const isBusy = busy === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => switchTo(id)}
            disabled={busy !== null}
            title={`Switch to ${label}`}
            style={{
              ...styles.btn,
              background: isActive ? color : 'transparent',
              color: isActive ? '#fff' : '#c9cfdb',
              borderColor: isActive ? color : 'rgba(255,255,255,0.16)',
              cursor: busy ? 'wait' : 'pointer'
            }}
          >
            {isBusy ? '…' : label}
          </button>
        )
      })}
      {error && (
        <span style={styles.error} title="Switch failed">
          !
        </span>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    position: 'fixed',
    bottom: 20,
    right: 20,
    zIndex: 2147483647,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 999,
    background: 'rgba(16,18,24,0.92)',
    backdropFilter: 'blur(8px)',
    boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
    border: '1px solid rgba(255,255,255,0.1)',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#7c86a0',
    padding: '0 2px'
  },
  btn: {
    fontSize: 13,
    fontWeight: 600,
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.16)',
    transition: 'all 0.12s ease',
    minWidth: 64
  },
  error: { color: '#ff9aa9', fontWeight: 700, fontSize: 14, padding: '0 2px' }
}
