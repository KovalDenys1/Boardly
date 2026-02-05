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
      className={`md:hidden absolute inset-0 transition-all duration-300 ease-in-out ${
        isActive 
          ? 'opacity-100 translate-x-0 pointer-events-auto z-10' 
          : 'opacity-0 translate-x-full pointer-events-none z-0'
      }`}
      style={{ 
        transform: isActive ? 'translateX(0)' : 'translateX(100%)',
        height: '100%',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div className="h-full pb-20">
        {children}
      </div>
    </div>
  )
}
