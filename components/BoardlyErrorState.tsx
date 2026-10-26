'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import BoardlyErrorCard, { type BoardlyErrorCardProps } from '@/components/BoardlyErrorCard'
import { useLocalizedHref } from '@/lib/page-locale'

type BoardlyErrorStateProps = Omit<BoardlyErrorCardProps, 'onRetry' | 'HomeLink'> & { onRetry?: () => void }

export default function BoardlyErrorState({ onRetry, homeHref = '/', ...props }: BoardlyErrorStateProps) {
  const router = useRouter()
  const localize = useLocalizedHref()
  return (
    <BoardlyErrorCard
      {...props}
      onRetry={onRetry ?? (() => router.refresh())}
      HomeLink={Link}
      homeHref={localize(homeHref)}
    />
  )
}
