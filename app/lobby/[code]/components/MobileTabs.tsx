'use client'

import { useState } from 'react'

export type TabId = 'game' | 'scorecard' | 'players' | 'chat'

interface Tab {
  id: TabId
  label: string
  icon: string
  badge?: number
}

interface MobileTabsProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  tabs: Tab[]
  unreadChatCount?: number
}

export default function MobileTabs({ activeTab, onTabChange, tabs, unreadChatCount }: MobileTabsProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg z-40 md:hidden">
      <div className="grid grid-cols-4 gap-0">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          const hasBadge = tab.id === 'chat' && unreadChatCount && unreadChatCount > 0
          
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex flex-col items-center justify-center py-2 px-1 transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-t from-blue-50 to-transparent dark:from-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {/* Badge */}
              {hasBadge && (
                <div className="absolute top-1 right-1/4 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 animate-pulse shadow-lg">
                  {unreadChatCount! > 9 ? '9+' : unreadChatCount}
                </div>
              )}
              
              {/* Icon */}
              <span className={`text-2xl mb-0.5 transition-transform ${isActive ? 'scale-110' : ''}`}>
                {tab.icon}
              </span>
              
              {/* Label */}
              <span className={`text-xs font-medium ${isActive ? 'font-bold' : ''}`}>
                {tab.label}
              </span>
              
              {/* Active indicator */}
              {isActive && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-12 h-1 bg-blue-600 dark:bg-blue-400 rounded-b-full" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
