'use client'

import { sounds } from '@/lib/sounds'

export type TabId = 'game' | 'scorecard' | 'players' | 'chat'

interface Tab {
  id: TabId
  label: string
  icon: string
  badge?: number | string
}

interface MobileTabsProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  tabs: Tab[]
  unreadChatCount?: number
}

export default function MobileTabs({ activeTab, onTabChange, tabs, unreadChatCount }: MobileTabsProps) {
  return (
    <div className="flex-shrink-0 w-full bg-white/10 backdrop-blur-xl border-t border-white/20 shadow-lg lg:hidden pb-[max(env(safe-area-inset-bottom),0.25rem)]">
      <div className="grid grid-cols-4 gap-0">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          const badgeValue =
            tab.id === 'chat'
              ? (unreadChatCount && unreadChatCount > 0 ? (unreadChatCount > 9 ? '9+' : unreadChatCount) : null)
              : tab.badge ?? null
          const hasBadge = badgeValue !== null && badgeValue !== undefined && badgeValue !== 0
          
          return (
            <button
              key={tab.id}
              onClick={() => {
                sounds.play('click', { force: true })
                onTabChange(tab.id)
              }}
              className={`relative flex flex-col items-center justify-center py-2 px-1 transition-all duration-200 min-h-[56px] ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:bg-white/5 hover:text-white/70'
              }`}
            >
              {/* Badge */}
              {hasBadge && (
                <div className="absolute top-1 right-1 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 animate-pulse shadow-lg">
                  {badgeValue}
                </div>
              )}
              
              {/* Icon */}
              <span className={`text-2xl mb-0.5 transition-transform ${isActive ? 'scale-110' : ''}`}>
                {tab.icon}
              </span>
              
              {/* Label */}
              <span className={`text-xs font-medium max-w-full truncate px-1 ${isActive ? 'font-bold' : ''}`}>
                {tab.label}
              </span>
              
              {/* Active indicator */}
              {isActive && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-12 h-1 bg-white rounded-b-full" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
