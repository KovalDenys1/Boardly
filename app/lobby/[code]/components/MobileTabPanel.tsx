'use client'

import { TabId } from './MobileTabs'

interface MobileTabPanelProps {
  id: TabId
  activeTab: TabId
  children: React.ReactNode
}

export default function MobileTabPanel({ id, activeTab, children }: MobileTabPanelProps) {
  const isActive = activeTab === id

  return (
    <div
      className={`md:hidden absolute inset-0 w-full max-w-full transition-all duration-300 ease-in-out ${
        isActive
          ? 'opacity-100 pointer-events-auto z-10'
          : 'opacity-0 pointer-events-none z-0'
      }`}
      style={{
        transform: 'translate3d(0, 0, 0)',
        visibility: isActive ? 'visible' : 'hidden',
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
      }}
    >
      <div className="h-full min-h-0">
        {children}
      </div>
    </div>
  )
}
