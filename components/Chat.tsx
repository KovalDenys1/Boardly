'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'

interface ChatMessage {
  id: string
  userId: string
  username: string
  message: string
  timestamp: number
  type?: 'message' | 'system'
}

interface ChatProps {
  messages: ChatMessage[]
  onSendMessage: (message: string) => void
  currentUserId?: string | null
  isMinimized?: boolean
  onToggleMinimize?: () => void
  onClearChat?: () => void
  unreadCount?: number
  someoneTyping?: boolean
  fullScreen?: boolean
}

export default function Chat({
  messages,
  onSendMessage,
  currentUserId,
  isMinimized = false,
  onToggleMinimize,
  onClearChat,
  unreadCount = 0,
  someoneTyping = false,
  fullScreen = false,
}: ChatProps) {
  const { t } = useTranslation()
  const [newMessage, setNewMessage] = useState('')
  const [showScrollButton, setShowScrollButton] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const isScrolledUp = scrollHeight - scrollTop - clientHeight > 100
      setShowScrollButton(isScrolledUp)
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (!showScrollButton) {
      scrollToBottom()
    }
  }, [messages, showScrollButton])

  useEffect(() => {
    if (!isMinimized && !fullScreen) {
      inputRef.current?.focus()
    }
  }, [isMinimized, fullScreen])

  useEffect(() => {
    if (isMinimized || fullScreen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (chatRef.current && !chatRef.current.contains(event.target as Node)) {
        onToggleMinimize?.()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMinimized, onToggleMinimize, fullScreen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newMessage.trim()) {
      onSendMessage(newMessage.trim())
      setNewMessage('')
      inputRef.current?.focus()
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    if (isToday) {
      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    }

    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (isMinimized) {
    const ariaLabel = unreadCount > 0
      ? `${t('chat.openChat')} (${unreadCount} ${t('chat.unread', { count: unreadCount })})`
      : t('chat.openChat')

    return (
      <div className="fixed z-50" style={{ bottom: 'max(20px, calc(20px + env(safe-area-inset-bottom)))', right: '20px' }}>
        <button
          onClick={onToggleMinimize}
          aria-label={ariaLabel}
          className="bd-btn bd-btn-primary rounded-2xl border-2 border-bd-ink px-4 py-3 shadow-[0_10px_24px_-14px_rgba(31,27,22,0.5)] focus-visible:ring-4 focus-visible:ring-blue-400 focus-visible:outline-none"
        >
          <span className="text-xl" aria-hidden="true">💬</span>
          <span className="font-semibold">{t('chat.open')}</span>
          {unreadCount > 0 && (
            <span className="bd-chip bd-chip-coral min-w-[24px] justify-center px-2 py-0.5 text-xs font-bold" aria-label={t('chat.unread', { count: unreadCount })}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    )
  }

  return (
    <div
      ref={chatRef}
      className={`bd-card flex flex-col overflow-hidden ${fullScreen ? 'h-full rounded-none border-0 shadow-none' : 'fixed z-50 rounded-[24px]'}`}
      style={fullScreen ? {
        background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, var(--bd-card-warm) 100%)',
      } : {
        bottom: '20px',
        right: '20px',
        width: 'min(420px, calc(100vw - 40px))',
        height: 'min(600px, calc(100vh - 100px))',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, var(--bd-card-warm) 100%)',
      }}
    >
      <div
        className={`flex items-center justify-between border-b px-4 py-3 ${fullScreen ? 'rounded-none' : 'rounded-t-[24px]'}`}
        style={{ borderColor: 'var(--bd-line)', background: 'rgba(251,246,238,0.9)' }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="bd-live-dot" aria-hidden="true" />
          <div className="min-w-0">
            <div className="bd-kicker">Boardly Chat</div>
            <h3 className="truncate text-base font-bold text-bd-ink" id="chat-title">
              {t('chat.title')}
            </h3>
          </div>
          {messages.length > 0 && (
            <span className="bd-chip flex-shrink-0 px-2 py-0.5 text-xs" aria-label={t('chat.messageCount', { count: messages.length })}>
              {messages.length}
            </span>
          )}
        </div>

        {!fullScreen && (
          <div className="flex items-center gap-1" role="group" aria-label="Chat controls">
            {onClearChat && messages.length > 0 && (
              <button
                onClick={onClearChat}
                aria-label={t('chat.clear')}
                className="flex h-9 w-9 items-center justify-center rounded-xl border transition-colors focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
                style={{ borderColor: 'var(--bd-line)', background: 'white', color: 'var(--bd-ink-soft)' }}
                title={t('chat.clear')}
              >
                <span className="text-base" aria-hidden="true">🗑️</span>
              </button>
            )}
            <button
              onClick={onToggleMinimize}
              aria-label={t('chat.minimize')}
              className="flex h-9 w-9 items-center justify-center rounded-xl border transition-colors focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
              style={{ borderColor: 'var(--bd-line)', background: 'white', color: 'var(--bd-ink-soft)' }}
              title={t('chat.minimize')}
            >
              <span className="text-base" aria-hidden="true">−</span>
            </button>
          </div>
        )}
      </div>

      <div
        ref={messagesContainerRef}
        className="relative flex-1 space-y-2.5 overflow-y-auto p-4 scroll-smooth"
        style={{
          background:
            'radial-gradient(circle at 14% 8%, rgba(255,196,77,0.08), transparent 28%), radial-gradient(circle at 88% 12%, rgba(155,140,255,0.08), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(251,246,238,0.94) 100%)',
        }}
        role="log"
        aria-live="polite"
        aria-labelledby="chat-title"
        aria-label={t('chat.title')}
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <div className="mb-4 grid h-16 w-16 place-items-center rounded-[1.25rem] border-2 border-bd-ink bg-bd-sun text-3xl shadow-[4px_4px_0_var(--bd-ink)]">💬</div>
            <p className="mb-2 text-lg font-semibold text-bd-ink">{t('chat.noMessages')}</p>
            <p className="text-sm text-bd-ink-soft">{t('chat.startConversation')}</p>
          </div>
        ) : (
          <>
            {messages.map((msg, index) => {
              const isCurrentUser = msg.userId === currentUserId
              const showAvatar = msg.type !== 'system' && (index === 0 || messages[index - 1].userId !== msg.userId)

              return (
                <div
                  key={msg.id}
                  className={`flex gap-2 ${isCurrentUser ? 'flex-row-reverse' : 'flex-row'} animate-[slideIn_0.2s_ease-out]`}
                >
                  {msg.type !== 'system' && (
                    <div className={`flex-shrink-0 ${showAvatar ? 'opacity-100' : 'opacity-0'}`}>
                      <div className={`bd-avatar h-8 w-8 text-sm ${isCurrentUser ? 'bd-avatar-coral' : 'bd-avatar-lav'}`}>
                        {(isCurrentUser ? 'You' : msg.username).charAt(0).toUpperCase()}
                      </div>
                    </div>
                  )}

                  <div className={`flex flex-col ${msg.type === 'system' ? 'mx-auto items-center' : isCurrentUser ? 'items-end' : 'items-start'}`}>
                    {msg.type !== 'system' && showAvatar && !isCurrentUser && (
                      <div className="mb-1 px-1 text-xs font-semibold text-bd-ink-soft">
                        {msg.username}
                      </div>
                    )}

                    <div
                      className={`max-w-[280px] rounded-2xl px-4 py-2.5 shadow-sm transition-all hover:shadow-md sm:max-w-xs ${
                        msg.type === 'system'
                          ? 'text-center text-xs italic'
                          : isCurrentUser
                            ? 'rounded-br-md text-[var(--bd-bg)]'
                            : 'rounded-bl-md text-bd-ink'
                      }`}
                      style={
                        msg.type === 'system'
                          ? {
                              background: 'rgba(242,233,216,0.88)',
                              color: 'var(--bd-ink-soft)',
                              border: '1px solid var(--bd-line)',
                            }
                          : isCurrentUser
                            ? {
                                background: 'var(--bd-ink)',
                                boxShadow: '0 4px 0 0 rgba(255,107,91,0.22)',
                              }
                            : {
                                background: 'rgba(255,255,255,0.92)',
                                border: '1px solid var(--bd-line)',
                              }
                      }
                    >
                      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {msg.message}
                      </div>
                      {msg.type !== 'system' && (
                        <div className={`mt-1.5 flex items-center gap-1 text-[10px] ${isCurrentUser ? 'justify-end text-[rgba(251,246,238,0.78)]' : 'text-bd-ink-muted'}`}>
                          <span>{formatTime(msg.timestamp)}</span>
                          {isCurrentUser && <span className="opacity-75">✓</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </>
        )}

        {showScrollButton && (
          <button
            onClick={scrollToBottom}
            className="bd-btn bd-btn-soft absolute bottom-4 right-4 rounded-full !p-3 shadow-lg hover:scale-110 active:scale-95 focus-visible:ring-4 focus-visible:ring-blue-400 focus-visible:outline-none animate-[bounce-in_0.3s_ease-out]"
            aria-label="Scroll to bottom"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        )}
      </div>

      {someoneTyping && (
        <div
          className="border-t px-4 py-2.5 animate-[fade-in_0.3s_ease-out]"
          style={{ borderColor: 'var(--bd-line)', background: 'rgba(242,233,216,0.62)' }}
        >
          <div className="flex items-center gap-2.5 text-bd-ink-muted">
            <div className="flex gap-1">
              <div className="h-2 w-2 rounded-full animate-bounce" style={{ background: 'var(--bd-coral)' }} />
              <div className="h-2 w-2 rounded-full animate-bounce" style={{ animationDelay: '0.15s', background: 'var(--bd-coral)' }} />
              <div className="h-2 w-2 rounded-full animate-bounce" style={{ animationDelay: '0.3s', background: 'var(--bd-coral)' }} />
            </div>
            <span className="text-sm font-medium">{t('chat.typing')}</span>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className={`border-t p-4 ${fullScreen ? 'rounded-none' : 'rounded-b-[24px]'}`}
        style={{ borderColor: 'var(--bd-line)', background: 'rgba(255,248,236,0.9)' }}
      >
        <div className="flex gap-2.5">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={t('chat.placeholder')}
              aria-label={t('chat.placeholder')}
              className="bd-input pr-14 text-sm hover:border-[var(--bd-ink)] focus:ring-2 focus:ring-blue-500"
              maxLength={200}
            />
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-bd-ink-muted" aria-hidden="true">
              {newMessage.length}/200
            </div>
          </div>
          <button
            type="submit"
            disabled={!newMessage.trim()}
            aria-label={t('chat.send')}
            className="bd-btn bd-btn-primary min-w-[64px] justify-center rounded-2xl px-4 py-3 text-sm focus-visible:ring-4 focus-visible:ring-blue-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            📤
          </button>
        </div>
        <div className="mt-2 text-center text-[10px] text-bd-ink-muted">
          {t('chat.sendHelp')}
        </div>
      </form>
    </div>
  )
}
