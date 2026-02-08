import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useGuest } from '@/contexts/GuestContext'

export function useGuestMode(isGuest: boolean, code: string) {
  const router = useRouter()
  const { guestName: contextGuestName, guestId: contextGuestId } = useGuest()
  const [guestName, setGuestName] = useState<string>('')
  const [guestId, setGuestId] = useState<string>('')

  useEffect(() => {
    if (isGuest && typeof window !== 'undefined') {
      // Use guest data from Context
      if (contextGuestName && contextGuestId) {
        setGuestName(contextGuestName)
        setGuestId(contextGuestId)
      } else {
        // Fallback: check localStorage for backward compatibility
        const storedGuestName = localStorage.getItem('guestName')
        const storedGuestId = localStorage.getItem('guestId')

        if (storedGuestName && storedGuestId) {
          setGuestName(storedGuestName)
          setGuestId(storedGuestId)
        } else {
          // No guest data found, redirect back to join page
          router.push(`/lobby/join/${code}`)
        }
      }
    }
  }, [isGuest, code, router, contextGuestName, contextGuestId])

  return { guestName, guestId }
}
