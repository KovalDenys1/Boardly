'use client'

import React, { useEffect } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
}

export default function Modal({ isOpen, onClose, title, children, maxWidth = 'lg' }: ModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const maxWidthStyles = {
    sm: 'min(384px, 90vw)',
    md: 'min(448px, 90vw)',
    lg: 'min(512px, 90vw)',
    xl: 'min(576px, 90vw)',
    '2xl': 'min(672px, 90vw)',
    full: '100%'
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ padding: `clamp(12px, 1.2vw, 20px)` }}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div
        className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-h-[90vh] flex flex-col border-gray-200 dark:border-gray-700 animate-scale-in"
        style={{
          maxWidth: maxWidthStyles[maxWidth],
          width: '100%',
          borderWidth: `clamp(1px, 0.1vw, 2px)`,
        }}
      >
        {/* Header */}
        {title && (
          <div
            className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 flex-shrink-0"
            style={{ padding: `clamp(12px, 1.2vh, 20px)` }}
          >
            <h2
              className="font-bold text-gray-900 dark:text-white"
              style={{ fontSize: `clamp(16px, 1.6vw, 24px)` }}
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              style={{ padding: `clamp(3px, 0.3vh, 5px)` }}
              aria-label="Close modal"
            >
              <svg
                className="fill-none stroke-current"
                viewBox="0 0 24 24"
                style={{
                  width: `clamp(20px, 2vw, 28px)`,
                  height: `clamp(20px, 2vw, 28px)`,
                }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Body */}
        <div
          className="flex-1 overflow-y-auto custom-scrollbar"
          style={{ padding: `clamp(12px, 1.2vh, 20px)` }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
