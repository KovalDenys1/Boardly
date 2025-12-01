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
}

export default function Chat({
  messages,
  onSendMessage,
  currentUserId,
  isMinimized = false,
  onToggleMinimize,
  onClearChat,
  unreadCount = 0,
  someoneTyping = false
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
      ? t('chat.openChat', { unread: t('chat.unread', { count: unreadCount }) })
      : t('chat.openChat', { unread: t('chat.noUnread') })
    
    return (
      <div className="fixed bottom-6 right-6 z-50 animate-bounce-in">
        <button
          onClick={onToggleMinimize}
          aria-label={ariaLabel}
          className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 transform transition-all duration-200 hover:scale-105 focus-visible:ring-4 focus-visible:ring-blue-400 focus-visible:outline-none"
        >
          💬 {t('chat.open')}
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full animate-pulse" aria-label={t('chat.unread', { count: unreadCount })}>
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
      className="fixed bottom-6 right-6 w-[calc(100vw-2rem)] max-w-sm sm:max-w-md lg:max-w-lg h-[70vh] max-h-[600px] sm:h-[500px] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 flex flex-col animate-slide-up"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-t-2xl">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" aria-hidden="true"></div>
          <h3 className="font-bold text-lg" id="chat-title">💬 {t('chat.title')}</h3>
          <span className="text-sm bg-blue-400/30 px-2 py-1 rounded-full" aria-label={t('chat.messageCount', { count: messages.length })}>
            {messages.length}
          </span>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Chat controls">
          <button
            onClick={onClearChat}
            aria-label={t('chat.clear')}
            className="hover:bg-blue-400/30 p-2 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            title={t('chat.clear')}
          >
            🗑️
          </button>
          <button
            onClick={onToggleMinimize}
            aria-label={t('chat.minimize')}
            className="hover:bg-blue-400/30 p-2 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            title={t('chat.minimize')}
          >
            ➖
          </button>
        </div>
      </div>

      {/* Messages */}
      <div 
        className="flex-1 overflow-y-auto p-4 space-y-3" 
        role="log" 
        aria-live="polite" 
        aria-labelledby="chat-title"
        aria-label="Chat messages"
      >
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 py-12">
            <div className="text-4xl mb-2">👋</div>
            <p className="font-medium">{t('chat.noMessages')}</p>
            <p className="text-sm">{t('chat.startConversation')}</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={msg.id}
              className={`flex flex-col animate-fade-in ${
                msg.userId === currentUserId ? 'items-end' : 'items-start'
              }`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                  msg.type === 'system'
                    ? 'bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 text-gray-600 dark:text-gray-300 italic text-center mx-auto'
                    : msg.userId === currentUserId
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                    : 'bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 text-gray-900 dark:text-gray-100'
                }`}
              >
                {msg.type !== 'system' && (
                  <div className={`font-semibold text-xs mb-1 ${
                    msg.userId === currentUserId ? 'text-blue-100' : 'text-gray-600 dark:text-gray-400'
                  }`}>
                    {msg.userId === currentUserId ? t('chat.you') : msg.username}
                  </div>
                )}
                <div className="break-words leading-relaxed">{msg.message}</div>
                <div className={`text-xs mt-2 ${
                  msg.userId === currentUserId ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
                }`}>
                  {formatTime(msg.timestamp)}
                </div>
              </div>
            </div>
          ))
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator - moved to bottom */}
      {someoneTyping && (
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 animate-fade-in">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
            <span className="text-sm">{t('chat.typing')}</span>
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-b-2xl">
        <div className="flex gap-3">
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
              className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 transition-all duration-200 focus-visible:outline-none"
              maxLength={200}
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" aria-hidden="true">
              {t('chat.maxLength', { current: newMessage.length, max: 200 })}
            </div>
          </div>
          <button
            type="submit"
            disabled={!newMessage.trim()}
            aria-label="Send message"
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl font-semibold transition-all duration-200 transform hover:scale-105 disabled:hover:scale-100 disabled:cursor-not-allowed shadow-lg focus-visible:ring-4 focus-visible:ring-blue-400 focus-visible:outline-none"
          >
            📤 {t('chat.send')}
          </button>
        </div>
        <div id="message-help" className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
          {t('chat.sendHelp')}
        </div>
      </form>
    </div>
  )
}