'use client'
import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

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
  currentUserId?: string
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
  fullScreen = false
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

  // Check scroll position to show/hide scroll button
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

  // Auto-focus input when chat opens
  useEffect(() => {
    if (!isMinimized && !fullScreen) {
      inputRef.current?.focus()
    }
  }, [isMinimized, fullScreen])

  // Close chat when clicking outside (only for desktop floating mode)
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value)
  }

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
        minute: '2-digit'
      })
    } else {
      return date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  }

  if (isMinimized) {
    const ariaLabel = unreadCount > 0 
      ? `${t('chat.openChat')} (${unreadCount} ${t('chat.unread', { count: unreadCount })})`
      : t('chat.openChat')
    
    return (
      <div className="fixed z-50 bottom-4 right-4">
        <button
          onClick={onToggleMinimize}
          aria-label={ariaLabel}
          className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-xl shadow-xl flex items-center gap-2 px-4 py-3 min-h-[44px] transform transition-all duration-200 hover:scale-105 active:scale-95 focus-visible:ring-4 focus-visible:ring-blue-400 focus-visible:outline-none"
        >
          <span className="text-xl">💬</span>
          <span className="font-semibold text-sm sm:text-base">{t('chat.open')}</span>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[1.25rem] text-center animate-pulse" aria-label={t('chat.unread', { count: unreadCount })}>
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
      className={`bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col ${
        fullScreen 
          ? 'h-full rounded-none' 
          : 'fixed z-50 rounded-2xl'
      }`}
      style={fullScreen ? {} : {
        bottom: '1rem',
        right: '1rem',
        width: 'min(26rem, calc(100vw - 2rem))',
        height: 'min(37.5rem, calc(100vh - 6rem))'
      }}
    >
      {/* Header */}
      <div className={`flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-3 ${
        fullScreen ? 'rounded-none' : 'rounded-t-2xl'
      }`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse flex-shrink-0" aria-hidden="true" />
          <h3 className="font-bold text-lg truncate" id="chat-title">
            💬 {t('chat.title')}
          </h3>
          {messages.length > 0 && (
            <span className="bg-white/20 rounded-full text-xs font-semibold px-2 py-0.5 flex-shrink-0" aria-label={t('chat.messageCount', { count: messages.length })}>
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
                className="hover:bg-white/20 rounded-lg transition-colors p-2 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                title={t('chat.clear')}
              >
                <span className="text-lg">🗑️</span>
              </button>
            )}
            <button
              onClick={onToggleMinimize}
              aria-label={t('chat.minimize')}
              className="hover:bg-white/20 rounded-lg transition-colors p-2 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
              title={t('chat.minimize')}
            >
              <span className="text-lg">➖</span>
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-2.5 scroll-smooth bg-gradient-to-b from-gray-50/50 to-white dark:from-gray-900/50 dark:to-gray-800 relative"
        role="log" 
        aria-live="polite" 
        aria-labelledby="chat-title"
        aria-label={t('chat.title')}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 dark:text-gray-400 px-4">
            <div className="text-6xl mb-4 animate-bounce">👋</div>
            <p className="font-semibold text-lg mb-2">{t('chat.noMessages')}</p>
            <p className="text-sm opacity-75">{t('chat.startConversation')}</p>
          </div>
        ) : (
          <>
            {messages.map((msg, index) => {
              const isCurrentUser = msg.userId === currentUserId
              const showAvatar = msg.type !== 'system' && (index === 0 || messages[index - 1].userId !== msg.userId)
              
              return (
                <div
                  key={msg.id}
                  className={`flex gap-2 ${
                    isCurrentUser ? 'flex-row-reverse' : 'flex-row'
                  } animate-[slideIn_0.2s_ease-out]`}
                >
                  {/* Avatar */}
                  {msg.type !== 'system' && (
                    <div className={`flex-shrink-0 ${showAvatar ? 'opacity-100' : 'opacity-0'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm shadow-md ${
                        isCurrentUser 
                          ? 'bg-gradient-to-br from-blue-500 to-purple-600' 
                          : 'bg-gradient-to-br from-gray-500 to-gray-600'
                      }`}>
                        {(isCurrentUser ? 'You' : msg.username).charAt(0).toUpperCase()}
                      </div>
                    </div>
                  )}
                  
                  {/* Message bubble */}
                  <div className={`flex flex-col ${
                    msg.type === 'system' ? 'items-center mx-auto' : (isCurrentUser ? 'items-end' : 'items-start')
                  }`}>
                    {msg.type !== 'system' && showAvatar && !isCurrentUser && (
                      <div className="font-semibold text-xs text-gray-600 dark:text-gray-400 mb-1 px-1">
                        {msg.username}
                      </div>
                    )}
                    
                    <div
                      className={`max-w-[280px] sm:max-w-xs rounded-2xl px-4 py-2.5 shadow-sm transition-all hover:shadow-md ${
                        msg.type === 'system'
                          ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 italic text-center text-xs'
                          : isCurrentUser
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-br-md'
                          : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-md border border-gray-200 dark:border-gray-600'
                      }`}
                    >
                      <div className="break-words text-sm leading-relaxed whitespace-pre-wrap">
                        {msg.message}
                      </div>
                      {msg.type !== 'system' && (
                        <div className={`text-[10px] mt-1.5 flex items-center gap-1 ${
                          isCurrentUser ? 'text-blue-100 justify-end' : 'text-gray-500 dark:text-gray-400'
                        }`}>
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
        
        {/* Scroll to bottom button */}
        {showScrollButton && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full p-3 shadow-lg hover:shadow-xl transition-all transform hover:scale-110 active:scale-95 border border-gray-200 dark:border-gray-600 focus-visible:ring-4 focus-visible:ring-blue-400 focus-visible:outline-none animate-[bounce-in_0.3s_ease-out]"
            aria-label="Scroll to bottom"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        )}
      </div>

      {/* Typing indicator */}
      {someoneTyping && (
        <div className="px-4 py-2.5 border-t border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900/50 dark:to-gray-800/50 animate-[fade-in_0.3s_ease-out]">
          <div className="flex items-center gap-2.5 text-gray-500 dark:text-gray-400">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
              <div className="w-2 h-2 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
            </div>
            <span className="text-sm font-medium">{t('chat.typing')}</span>
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className={`border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 ${
        fullScreen ? 'rounded-none' : 'rounded-b-2xl'
      }`}>
        <div className="flex gap-2.5">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              placeholder={t('chat.placeholder')}
              aria-label={t('chat.placeholder')}
              className="w-full px-4 py-3 pr-14 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm transition-all focus-visible:outline-none placeholder:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500"
              maxLength={200}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500 font-medium pointer-events-none" aria-hidden="true">
              {newMessage.length}/200
            </div>
          </div>
          <button
            type="submit"
            disabled={!newMessage.trim()}
            aria-label={t('chat.send')}
            className="px-5 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl font-semibold text-sm transition-all transform hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:cursor-not-allowed disabled:opacity-50 shadow-md hover:shadow-lg focus-visible:ring-4 focus-visible:ring-blue-400 focus-visible:outline-none whitespace-nowrap min-w-[60px]"
          >
            📤
          </button>
        </div>
        <div className="text-center text-[10px] text-gray-400 dark:text-gray-500 mt-2">
          {t('chat.sendHelp')}
        </div>
      </form>
    </div>
  )
}