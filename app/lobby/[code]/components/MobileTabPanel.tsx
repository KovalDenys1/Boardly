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
          ? 'opacity-100 translate-x-0 pointer-events-auto' 
          : 'opacity-0 translate-x-full pointer-events-none'
      }`}
      style={{ 
        transform: isActive ? 'translateX(0)' : 'translateX(100%)',
      }}
    >
      <div className="h-full overflow-y-auto pb-16">
        {children}
      </div>
    </div>
  )
}
