/**
 * Direct re-export of useSyncExternalStore from React 18+.
 * Used as a webpack alias for 'use-sync-external-store/shim' to bypass the
 * process.env.NODE_ENV conditional in the original shim, which causes
 * React Refresh (HMR) to encounter an undefined module factory in dev mode.
 */
const React = require('react')
exports.useSyncExternalStore = React.useSyncExternalStore
