'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import BoardlyErrorCard, { type BoardlyErrorCardProps } from '@/components/BoardlyErrorCard'

type BoardlyErrorStateProps = Omit<BoardlyErrorCardProps, 'onRetry' | 'HomeLink'> & { onRetry?: () => void }

export default function BoardlyErrorState({ onRetry, ...props }: BoardlyErrorStateProps) {
  const router = useRouter()
  return <BoardlyErrorCard {...props} onRetry={onRetry ?? (() => router.refresh())} HomeLink={Link} />
}
