/**
 * Cache-Control for storefront SSR pages.
 *
 * Normally these pages are CDN-cached (`s-maxage=10, stale-while-revalidate=59`)
 * for performance. But when the live content-source switcher is enabled, a
 * cached render would keep showing the old dataset for up to ~a minute after a
 * switch — so on those deployments we serve `no-store` and let every load
 * re-render from the active source.
 */
export function storefrontCacheControl(): string {
  return process.env.NEXT_PUBLIC_SHOW_CONTENT_SWITCHER === 'on'
    ? 'no-store'
    : 'public, s-maxage=10, stale-while-revalidate=59'
}
