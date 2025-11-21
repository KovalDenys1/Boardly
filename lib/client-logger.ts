/**
 * Client-side logging utility
 * Only logs in development mode to keep production console clean
 */

const isDevelopment = process.env.NODE_ENV === 'development'

export const clientLogger = {
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args)
    }
  },
  
  warn: (...args: any[]) => {
    if (isDevelopment) {
      console.warn(...args)
    }
  },
  
  error: (...args: any[]) => {
    // Always log errors, even in production
    console.error(...args)
  },
  
  info: (...args: any[]) => {
    if (isDevelopment) {
      console.info(...args)
    }
  },
  
  debug: (...args: any[]) => {
    if (isDevelopment) {
      console.debug(...args)
    }
  },
}
