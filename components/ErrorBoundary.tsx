'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { clientLogger } from '@/lib/client-logger'
import BoardlyErrorState from '@/components/BoardlyErrorState'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error?: Error
}

/**
 * Error Boundary component for catching and handling React errors
 * Prevents entire app from crashing when a component throws an error
 * 
 * Usage:
 * <ErrorBoundary fallback={<MyFallbackUI />}>
 *   <MyComponent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    clientLogger.error('ErrorBoundary caught an error:', error, errorInfo)
    
    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }
  }

  public render() {
    if (this.state.hasError) {
      // Use custom fallback if provided, otherwise show default error UI
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <BoardlyErrorState
          error={this.state.error}
          onRetry={() => window.location.reload()}
          kicker="Boardly · Component Error"
          retryLabel="Reload Page"
        />
      )
    }

    return this.props.children
  }
}
