import type { Metadata } from 'next'
import MaintenanceContent from './MaintenanceContent'

export const metadata: Metadata = {
  title: 'Site Maintenance',
  robots: {
    index: false,
    follow: false,
  },
}

export default function MaintenancePage() {
  return <MaintenanceContent />
}
