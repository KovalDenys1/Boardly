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
  fullScreen?: boolean // New prop for mobile full-screen mode
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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Close chat when clicking outside
  useEffect(() => {
    if (isMinimized) return

    const handleClickOutside = (event: MouseEvent) => {
      if (chatRef.current && !chatRef.current.contains(event.target as Node)) {
        onToggleMinimize?.()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMinimized, onToggleMinimize])

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
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const clearChat = () => {
    // This would need to be passed as a prop or handled differently
    // For now, just show a message
    alert('Chat clearing not implemented yet')
  }

  if (isMinimized) {
    const ariaLabel = unreadCount > 0 
      ? `${t('chat.openChat')} (${unreadCount} ${t('chat.unread', { count: unreadCount })})`
      : t('chat.openChat')
    
    return (
      <div className="fixed z-50 animate-bounce-in" style={{ bottom: 'clamp(16px, 2vh, 32px)', right: 'clamp(16px, 2vw, 32px)' }}>
        <button
          onClick={onToggleMinimize}
          aria-label={ariaLabel}
          className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-xl shadow-xl flex items-center transform transition-all duration-200 hover:scale-105 focus-visible:ring-4 focus-visible:ring-blue-400 focus-visible:outline-none"
          style={{ padding: 'clamp(10px, 1vh, 16px) clamp(12px, 1.2vw, 20px)', gap: 'clamp(6px, 0.6vw, 12px)', fontSize: 'clamp(14px, 1vw, 18px)' }}
        >
          💬 {t('chat.open')}
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white rounded-full animate-pulse" aria-label={t('chat.unread', { count: unreadCount })} style={{ fontSize: 'clamp(11px, 0.85vw, 14px)', padding: 'clamp(3px, 0.3vh, 6px) clamp(6px, 0.6vw, 10px)' }}>
              {unreadCount}
            </span>
          )}
        </button>
      </div>
    )
  }

  return (
    <div 
      ref={chatRef}
      className={`bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col animate-slide-up ${
        fullScreen 
          ? 'fixed inset-0 z-40 rounded-none' 
          : 'fixed z-50'
      }`}
      style={fullScreen ? {} : {
        bottom: 'clamp(16px, 2vh, 32px)',
        right: 'clamp(16px, 2vw, 32px)',
        width: 'min(500px, calc(100vw - 2rem))',
        height: 'clamp(400px, 70vh, 600px)',
        borderRadius: 'clamp(16px, 1.6vw, 24px)'
      }}
    >
      {/* Header */}
      <div className={`flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-500 to-purple-600 text-white ${
        fullScreen ? 'rounded-none' : 'rounded-t-2xl'
      }`} style={{ 
        padding: 'clamp(12px, 1.2vh, 20px)', 
        borderTopLeftRadius: fullScreen ? '0' : 'clamp(16px, 1.6vw, 24px)', 
        borderTopRightRadius: fullScreen ? '0' : 'clamp(16px, 1.6vw, 24px)' 
      }}>
        <div className="flex items-center" style={{ gap: 'clamp(10px, 1vw, 16px)' }}>
          <div className="bg-green-400 rounded-full animate-pulse" aria-hidden="true" style={{ width: 'clamp(10px, 1vw, 14px)', height: 'clamp(10px, 1vw, 14px)' }}></div>
          <h3 className="font-bold" id="chat-title" style={{ fontSize: 'clamp(16px, 1.2vw, 20px)' }}>💬 {t('chat.title')}</h3>
          <span className="bg-blue-400/30 rounded-full" aria-label={t('chat.messageCount', { count: messages.length })} style={{ fontSize: 'clamp(12px, 0.9vw, 15px)', padding: 'clamp(3px, 0.3vh, 6px) clamp(6px, 0.6vw, 10px)' }}>
            {messages.length}
          </span>
        </div>
        <div className="flex items-center" role="group" aria-label="Chat controls" style={{ gap: 'clamp(4px, 0.4vw, 8px)' }}>
          <button
            onClick={onClearChat}
            aria-label={t('chat.clear')}
            className="hover:bg-blue-400/30 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            title={t('chat.clear')}
            style={{ padding: 'clamp(6px, 0.6vh, 10px)', fontSize: 'clamp(16px, 1.2vw, 20px)' }}
          >
            🗑️
          </button>
          <button
            onClick={onToggleMinimize}
            aria-label={t('chat.minimize')}
            className="hover:bg-blue-400/30 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            title={t('chat.minimize')}
            style={{ padding: 'clamp(6px, 0.6vh, 10px)', fontSize: 'clamp(16px, 1.2vw, 20px)' }}
          >
            ➖
          </button>
        </div>
      </div>

      {/* Messages */}
      <div 
        className="flex-1 overflow-y-auto" 
        style={{ padding: 'clamp(12px, 1.2vh, 20px)', gap: 'clamp(10px, 1vh, 16px)' }}
        role="log" 
        aria-live="polite" 
        aria-labelledby="chat-title"
        aria-label="Chat messages"
      >
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400" style={{ paddingTop: 'clamp(40px, 8vh, 80px)', paddingBottom: 'clamp(40px, 8vh, 80px)' }}>
            <div style={{ fontSize: 'clamp(32px, 3vw, 48px)', marginBottom: 'clamp(8px, 0.8vh, 12px)' }}>👋</div>
            <p className="font-medium" style={{ fontSize: 'clamp(14px, 1vw, 18px)' }}>{t('chat.noMessages')}</p>
            <p style={{ fontSize: 'clamp(12px, 0.9vw, 15px)' }}>{t('chat.startConversation')}</p>
          </div>
        ) : (
          <div className="flex flex-col" style={{ gap: 'clamp(10px, 1vh, 16px)' }}>
            {messages.map((msg, index) => (
              <div
                key={msg.id}
                className={`flex flex-col animate-fade-in ${
                  msg.userId === currentUserId ? 'items-end' : 'items-start'
                }`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div
                  className={`max-w-[85%] shadow-sm ${
                    msg.type === 'system'
                      ? 'bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 text-gray-600 dark:text-gray-300 italic text-center mx-auto'
                      : msg.userId === currentUserId
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                      : 'bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 text-gray-900 dark:text-gray-100'
                  }`}
                  style={{ borderRadius: 'clamp(12px, 1.2vw, 20px)', padding: 'clamp(10px, 1vh, 16px) clamp(12px, 1.2vw, 20px)', fontSize: 'clamp(12px, 0.9vw, 15px)' }}
                >
                  {msg.type !== 'system' && (
                    <div className={`font-semibold ${
                      msg.userId === currentUserId ? 'text-blue-100' : 'text-gray-600 dark:text-gray-400'
                    }`} style={{ fontSize: 'clamp(11px, 0.85vw, 14px)', marginBottom: 'clamp(3px, 0.3vh, 6px)' }}>
                      {msg.userId === currentUserId ? t('chat.you') : msg.username}
                    </div>
                  )}
                  <div className="break-words leading-relaxed">{msg.message}</div>
                  <div className={`${
                    msg.userId === currentUserId ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
                  }`} style={{ fontSize: 'clamp(10px, 0.8vw, 13px)', marginTop: 'clamp(6px, 0.6vh, 10px)' }}>
                    {formatTime(msg.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator - moved to bottom */}
      {someoneTyping && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800" style={{ padding: 'clamp(6px, 0.6vh, 10px) clamp(12px, 1.2vw, 20px)' }}>
          <div className="flex items-center text-gray-500 dark:text-gray-400 animate-fade-in" style={{ gap: 'clamp(6px, 0.6vw, 12px)' }}>
            <div className="flex" style={{ gap: 'clamp(3px, 0.3vw, 6px)' }}>
              <div className="bg-gray-400 rounded-full animate-bounce" style={{ width: 'clamp(6px, 0.6vw, 10px)', height: 'clamp(6px, 0.6vw, 10px)' }}></div>
              <div className="bg-gray-400 rounded-full animate-bounce" style={{ width: 'clamp(6px, 0.6vw, 10px)', height: 'clamp(6px, 0.6vw, 10px)', animationDelay: '0.1s' }}></div>
              <div className="bg-gray-400 rounded-full animate-bounce" style={{ width: 'clamp(6px, 0.6vw, 10px)', height: 'clamp(6px, 0.6vw, 10px)', animationDelay: '0.2s' }}></div>
            </div>
            <span style={{ fontSize: 'clamp(12px, 0.9vw, 15px)' }}>{t('chat.typing')}</span>
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800" style={{ padding: 'clamp(12px, 1.2vh, 20px)', borderBottomLeftRadius: 'clamp(16px, 1.6vw, 24px)', borderBottomRightRadius: 'clamp(16px, 1.6vw, 24px)' }}>
        <div className="flex" style={{ gap: 'clamp(10px, 1vw, 16px)' }}>
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder={t('chat.placeholder')}
              aria-label="Type your message"
              aria-describedby="message-help"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 transition-all duration-200 focus-visible:outline-none"
              style={{ padding: 'clamp(10px, 1vh, 16px) clamp(12px, 1.2vw, 20px)', paddingRight: 'clamp(40px, 4vw, 60px)', fontSize: 'clamp(13px, 0.95vw, 16px)' }}
              maxLength={200}
            />
            <div className="absolute top-1/2 transform -translate-y-1/2 text-gray-400" style={{ right: 'clamp(10px, 1vw, 16px)', fontSize: 'clamp(10px, 0.8vw, 13px)' }} aria-hidden="true">
              {t('chat.maxLength', { current: newMessage.length, max: 200 })}
            </div>
          </div>
          <button
            type="submit"
            disabled={!newMessage.trim()}
            aria-label="Send message"
            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl font-semibold transition-all duration-200 transform hover:scale-105 disabled:hover:scale-100 disabled:cursor-not-allowed shadow-lg focus-visible:ring-4 focus-visible:ring-blue-400 focus-visible:outline-none"
            style={{ padding: 'clamp(10px, 1vh, 16px) clamp(18px, 1.8vw, 28px)', fontSize: 'clamp(13px, 0.95vw, 16px)' }}
          >
            📤 {t('chat.send')}
          </button>
        </div>
        <div id="message-help" className="text-gray-500 dark:text-gray-400 text-center" style={{ fontSize: 'clamp(10px, 0.8vw, 13px)', marginTop: 'clamp(6px, 0.6vh, 10px)' }}>
          {t('chat.sendHelp')}
        </div>
      </form>
    </div>
  )
}