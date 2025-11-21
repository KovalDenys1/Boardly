import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function useGuestMode(isGuest: boolean, code: string) {
  const router = useRouter()
  const [guestName, setGuestName] = useState<string>('')
  const [guestId, setGuestId] = useState<string>('')

  useEffect(() => {
    if (isGuest && typeof window !== 'undefined') {
      const storedGuestName = localStorage.getItem('guestName')
      if (storedGuestName) {
        setGuestName(storedGuestName)
        // Generate or retrieve guest ID
        let storedGuestId = localStorage.getItem('guestId')
        if (!storedGuestId) {
          storedGuestId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          localStorage.setItem('guestId', storedGuestId)
        }
        setGuestId(storedGuestId)
      } else {
        // No guest name found, redirect back to join page
        router.push(`/lobby/join/${code}`)
      }
    }
  }, [isGuest, code, router])

  return { guestName, guestId }
}
