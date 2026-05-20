'use client'

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full'
  mobileFullscreen?: boolean
  bodyPadding?: 'default' | 'none'
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'lg',
  mobileFullscreen = false,
  bodyPadding = 'default',
}: ModalProps) {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    return () => {
      setIsMounted(false)
    }
  }, [])

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

  if (!isOpen || !isMounted) return null

  const maxWidthStyles = {
    sm: 'min(384px, 90vw)',
    md: 'min(448px, 90vw)',
    lg: 'min(512px, 90vw)',
    xl: 'min(576px, 90vw)',
    '2xl': 'min(672px, 90vw)',
    '3xl': 'min(896px, 92vw)',
    '4xl': 'min(1120px, 94vw)',
    full: '100%'
  }

  const portalTarget = document.getElementById('bd-lobby-portal') ?? document.body

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex justify-center animate-fade-in ${
        mobileFullscreen ? 'items-stretch sm:items-center' : 'items-center'
      }`}
      style={{ padding: mobileFullscreen ? '0px' : `clamp(12px, 1.2vw, 20px)` }}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 z-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div
        className={`relative z-10 flex w-full flex-col shadow-2xl animate-scale-in ${
          mobileFullscreen
            ? 'h-[100dvh] max-h-[100dvh] rounded-none border-0 sm:h-auto sm:max-h-[92vh] sm:rounded-3xl sm:border'
            : 'max-h-[90vh] rounded-2xl border'
        }`}
        style={{
          background: 'var(--bd-card-warm)',
          borderColor: 'var(--bd-line)',
          maxWidth: maxWidthStyles[maxWidth],
          borderWidth: `clamp(1px, 0.1vw, 2px)`,
        }}
      >
        {/* Header */}
        {title && (
          <div
            className={`flex flex-shrink-0 items-center justify-between border-b ${
              mobileFullscreen ? 'px-4 py-4 sm:px-6 sm:py-5' : ''
            }`}
            style={mobileFullscreen ? { borderColor: 'var(--bd-line)' } : { padding: `clamp(12px, 1.2vh, 20px)`, borderColor: 'var(--bd-line)' }}
          >
            <h2
              className={`font-bold ${
                mobileFullscreen ? 'pr-4 text-lg sm:text-2xl' : ''
              }`}
              style={{ ...(mobileFullscreen ? {} : { fontSize: `clamp(16px, 1.6vw, 24px)` }), color: 'var(--bd-ink)' }}
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              className="transition-colors rounded-xl"
              style={{ padding: `clamp(3px, 0.3vh, 5px)`, color: 'var(--bd-ink-muted)' }}
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
          className={`flex-1 overflow-y-auto custom-scrollbar ${
            bodyPadding === 'default' && mobileFullscreen ? 'px-4 py-4 sm:px-6 sm:py-6' : ''
          }`}
          style={
            bodyPadding === 'none'
              ? undefined
              : mobileFullscreen
                ? undefined
                : { padding: `clamp(12px, 1.2vh, 20px)` }
          }
        >
          {children}
        </div>
      </div>
    </div>,
    portalTarget
  )
}
