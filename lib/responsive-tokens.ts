/**
 * Responsive layout tokens — the single source for viewport constants.
 * See docs/RESPONSIVE.md. Enforced by scripts/audit-responsive.ts.
 *
 * The same values exist in three coordinated carriers (CSS custom properties
 * cannot appear inside @media conditions, so raw px literals in media queries
 * are unavoidable — the audit fails CI when a literal drifts from these):
 * - this file (TS constants for client code and the audit)
 * - `--bd-header-h` in app/globals.css `:root` (for calc())
 * - `--breakpoint-desk` (the `desk:` screen) in app/globals.css `@theme` and px literals in @media queries
 */

export const HEADER_HEIGHT_PX = 64

/**
 * The single mobile/desktop switch point. Viewports >= this width get the
 * desktop layout (side panels, grid); anything narrower gets the mobile
 * layout (tabs). Decision record: docs/RESPONSIVE.md#breakpoint-decision-record
 * (1024 chosen over 900 — phone-landscape ~850-930px wide x ~390px tall must
 * get the mobile layout; matches Tailwind `lg:` already used by MobileTabs).
 */
export const DESKTOP_MIN_WIDTH_PX = 1024

export const MOBILE_MAX_WIDTH_PX = DESKTOP_MIN_WIDTH_PX - 1

export const MOBILE_MAX_MEDIA_QUERY = `(max-width: ${MOBILE_MAX_WIDTH_PX}px)`

export const DESKTOP_MIN_MEDIA_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH_PX}px)`

/**
 * Phone landscape: a mobile-width viewport that is wider than tall. Within
 * mobile widths, orientation picks the layout — portrait gets the stacked
 * mobile layout, landscape gets side-by-side panes (board left, chrome
 * right). See docs/RESPONSIVE.md#phone-landscape (#749).
 */
export const PHONE_LANDSCAPE_MEDIA_QUERY = `${MOBILE_MAX_MEDIA_QUERY} and (orientation: landscape)`
