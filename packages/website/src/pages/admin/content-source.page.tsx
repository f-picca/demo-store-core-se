import { CONTENT_SOURCES, type ContentSource } from '#utils/contentSource'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useState, type CSSProperties, type ReactElement } from 'react'

/**
 * Presenter-facing toggle to switch the storefront's content source live
 * (Sanity ⇄ Contentful) via Edge Config — no redeploy. Deliberately
 * self-contained (inline styles, no design-system deps) so it can be dropped in
 * front of a demo audience.
 *
 * Gate: append `?secret=…` matching CONTENT_SOURCE_ADMIN_SECRET (forwarded to
 * the write API). Not linked anywhere, so it stays out of the storefront nav.
 */

type SourceMeta = {
  id: ContentSource
  label: string
  color: string
  Logo: () => ReactElement
}

const SOURCES: SourceMeta[] = [
  { id: 'sanity', label: 'Sanity', color: '#F03E2F', Logo: SanityLogo },
  { id: 'contentful', label: 'Contentful', color: '#2478CC', Logo: ContentfulLogo }
]

type Status =
  | { kind: 'idle' }
  | { kind: 'switching'; to: ContentSource }
  | { kind: 'done'; to: ContentSource }
  | { kind: 'error'; message: string }

const ContentSourceAdminPage = () => {
  const router = useRouter()
  const [active, setActive] = useState<ContentSource | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const loadCurrent = useCallback(async () => {
    try {
      const res = await fetch('/api/content-source', { cache: 'no-store' })
      const data = await res.json()
      if (CONTENT_SOURCES.includes(data?.source)) {
        setActive(data.source)
      }
    } catch {
      /* leave `active` null — the UI just won't highlight a card yet */
    }
  }, [])

  useEffect(() => {
    void loadCurrent()
  }, [loadCurrent])

  const switchTo = useCallback(
    async (source: ContentSource) => {
      if (status.kind === 'switching' || source === active) {
        return
      }

      setStatus({ kind: 'switching', to: source })

      const secret = typeof router.query.secret === 'string' ? router.query.secret : undefined

      try {
        const res = await fetch('/api/content-source', {
          method: 'POST',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            ...(secret ? { 'x-admin-secret': secret } : {})
          },
          body: JSON.stringify({ source })
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.error || `Request failed (${res.status})`)
        }

        setActive(source)
        setStatus({ kind: 'done', to: source })
      } catch (error) {
        setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Unknown error' })
      }
    },
    [active, router.query.secret, status.kind]
  )

  return (
    <main style={styles.page}>
      <div style={styles.inner}>
        <p style={styles.eyebrow}>Demo control</p>
        <h1 style={styles.title}>Content source</h1>
        <p style={styles.subtitle}>Switch the storefront dataset live. No rebuild, no redeploy — refresh the store to see it.</p>

        <div style={styles.cards}>
          {SOURCES.map(({ id, label, color, Logo }) => {
            const isActive = active === id
            const isSwitching = status.kind === 'switching' && status.to === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => switchTo(id)}
                disabled={status.kind === 'switching'}
                style={{
                  ...styles.card,
                  borderColor: isActive ? color : 'rgba(255,255,255,0.12)',
                  boxShadow: isActive ? `0 0 0 3px ${hexToRgba(color, 0.25)}` : 'none',
                  cursor: status.kind === 'switching' ? 'wait' : 'pointer',
                  opacity: status.kind === 'switching' && !isSwitching ? 0.5 : 1
                }}
              >
                <span style={{ ...styles.logoWrap, color }}>
                  <Logo />
                </span>
                <span style={styles.cardLabel}>{label}</span>
                <span style={{ ...styles.badge, opacity: isActive ? 1 : 0, background: color }}>
                  {isSwitching ? 'Switching…' : 'Active'}
                </span>
              </button>
            )
          })}
        </div>

        <div style={styles.statusRow} aria-live="polite">
          {status.kind === 'done' && (
            <span style={{ ...styles.toast, background: '#123d1e', color: '#7ee2a0' }}>
              ✓ Content source switched to {labelOf(status.to)}
            </span>
          )}
          {status.kind === 'error' && (
            <span style={{ ...styles.toast, background: '#4a1520', color: '#ff9aa9' }}>
              ✗ {status.message}
            </span>
          )}
        </div>
      </div>
    </main>
  )
}

function labelOf(id: ContentSource): string {
  return SOURCES.find(s => s.id === id)?.label ?? id
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const r = parseInt(value.substring(0, 2), 16)
  const g = parseInt(value.substring(2, 4), 16)
  const b = parseInt(value.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function SanityLogo(): ReactElement {
  // Simplified Sanity monogram mark.
  return (
    <svg width="72" height="72" viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <path
        d="M30 28c0-8 7-14 18-14 12 0 19 6 21 16h-13c-1-4-4-6-8-6-5 0-8 2-8 6 0 4 3 6 12 8 13 3 21 7 21 19 0 8-6 15-19 16v-12c5-1 7-3 7-6 0-4-3-6-13-8-12-3-18-7-18-18z"
        fill="currentColor"
      />
      <path d="M58 58v12c-2 0-3 .3-6 .3-12 0-20-6-22-16h13c1 4 5 6 9 6l6-2.3z" fill="currentColor" opacity="0.55" />
    </svg>
  )
}

function ContentfulLogo(): ReactElement {
  // Simplified Contentful mark: three dots inside a ring.
  return (
    <svg width="72" height="72" viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <circle cx="50" cy="50" r="34" stroke="currentColor" strokeWidth="7" fill="none" opacity="0.85" />
      <circle cx="38" cy="38" r="8" fill="currentColor" />
      <circle cx="38" cy="62" r="8" fill="#FFD85F" />
      <circle cx="62" cy="50" r="8" fill="#3BB4E7" />
    </svg>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(circle at 50% 0%, #1b1f2a 0%, #0b0d12 60%)',
    padding: '32px',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  },
  inner: { width: '100%', maxWidth: 720, textAlign: 'center', color: '#e8ebf0' },
  eyebrow: { textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 12, color: '#7c86a0', margin: 0 },
  title: { fontSize: 40, fontWeight: 700, margin: '8px 0 6px' },
  subtitle: { fontSize: 16, color: '#9aa3b8', margin: '0 auto 40px', maxWidth: 460, lineHeight: 1.5 },
  cards: { display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' },
  card: {
    position: 'relative',
    width: 260,
    minHeight: 220,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    padding: '32px 24px',
    borderRadius: 20,
    border: '2px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.04)',
    color: '#e8ebf0',
    transition: 'all 0.15s ease',
    outline: 'none'
  },
  logoWrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 72 },
  cardLabel: { fontSize: 22, fontWeight: 600 },
  badge: {
    position: 'absolute',
    top: 14,
    right: 14,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#fff',
    padding: '4px 10px',
    borderRadius: 999,
    transition: 'opacity 0.15s ease'
  },
  statusRow: { minHeight: 48, marginTop: 32, display: 'flex', justifyContent: 'center', alignItems: 'center' },
  toast: { fontSize: 15, fontWeight: 600, padding: '10px 18px', borderRadius: 12 }
}

export default ContentSourceAdminPage
