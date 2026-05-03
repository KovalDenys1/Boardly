import toast from 'react-hot-toast'
import type { Toast as HotToast, ToastOptions } from 'react-hot-toast'
import { CelebrationEvent, getCategoryDisplayName } from '@/lib/celebrations'
import { YahtzeeCategory } from '@/lib/yahtzee'

type MomentTone = 'mint' | 'sun' | 'lav' | 'coral'

interface YahtzeeCategoryToastOptions {
  category: YahtzeeCategory
  score: number
  playerName?: string | null
  celebration?: CelebrationEvent | null
  isBestPick?: boolean
  duration?: number
  id?: string
}

function getToneClasses(tone: MomentTone) {
  switch (tone) {
    case 'mint':
      return {
        shell: 'border-[rgba(79,201,166,0.28)] bg-[linear-gradient(135deg,rgba(79,201,166,0.18),rgba(255,255,255,0.98))]',
        icon: 'bg-[rgba(79,201,166,0.18)] text-[var(--bd-mint-deep)]',
        badge: 'bg-[rgba(79,201,166,0.18)] text-[var(--bd-mint-deep)]',
      }
    case 'sun':
      return {
        shell: 'border-[rgba(255,196,77,0.34)] bg-[linear-gradient(135deg,rgba(255,196,77,0.2),rgba(255,255,255,0.98))]',
        icon: 'bg-[rgba(255,196,77,0.22)] text-[var(--bd-coral-deep)]',
        badge: 'bg-[rgba(255,196,77,0.22)] text-[var(--bd-coral-deep)]',
      }
    case 'lav':
      return {
        shell: 'border-[rgba(155,140,255,0.28)] bg-[linear-gradient(135deg,rgba(155,140,255,0.16),rgba(255,255,255,0.98))]',
        icon: 'bg-[rgba(155,140,255,0.16)] text-[var(--bd-lav-deep)]',
        badge: 'bg-[rgba(155,140,255,0.16)] text-[var(--bd-lav-deep)]',
      }
    case 'coral':
    default:
      return {
        shell: 'border-[rgba(255,107,91,0.28)] bg-[linear-gradient(135deg,rgba(255,107,91,0.16),rgba(255,255,255,0.98))]',
        icon: 'bg-[rgba(255,107,91,0.16)] text-[var(--bd-coral-deep)]',
        badge: 'bg-[rgba(255,107,91,0.18)] text-[var(--bd-coral-deep)]',
      }
  }
}

function BoardlyMomentToast({
  toastState,
  icon,
  eyebrow,
  title,
  detail,
  badge,
  tone,
}: {
  toastState: HotToast
  icon: string
  eyebrow: string
  title: string
  detail: string
  badge: string
  tone: MomentTone
}) {
  const toneClasses = getToneClasses(tone)

  return (
    <div
      className={`pointer-events-auto w-[min(92vw,360px)] rounded-[20px] border px-3.5 py-3 shadow-[0_14px_36px_rgba(41,37,36,0.14)] backdrop-blur-sm transition-all duration-200 ${
        toastState.visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      } ${toneClasses.shell}`}
      style={{ color: 'var(--bd-ink)' }}
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-2xl ${toneClasses.icon}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="bd-kicker">{eyebrow}</div>
          <div className="mt-0.5 text-sm font-semibold leading-tight text-bd-ink">
            {title}
          </div>
          <div className="mt-1 text-xs leading-relaxed text-bd-ink-soft">
            {detail}
          </div>
        </div>
        <div className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${toneClasses.badge}`}>
          {badge}
        </div>
      </div>
    </div>
  )
}

function showBoardlyMomentToast(
  {
    icon,
    eyebrow,
    title,
    detail,
    badge,
    tone,
  }: {
    icon: string
    eyebrow: string
    title: string
    detail: string
    badge: string
    tone: MomentTone
  },
  opts?: ToastOptions
) {
  return toast.custom(
    (toastState) => (
      <BoardlyMomentToast
        toastState={toastState}
        icon={icon}
        eyebrow={eyebrow}
        title={title}
        detail={detail}
        badge={badge}
        tone={tone}
      />
    ),
    {
      duration: 3200,
      position: 'top-center',
      ...opts,
    }
  )
}

function getCelebrationTone(event: CelebrationEvent): MomentTone {
  switch (event.type) {
    case 'yahtzee':
      return 'sun'
    case 'largeStraight':
      return 'lav'
    case 'fullHouse':
      return 'mint'
    case 'highScore':
      return 'coral'
    case 'perfectRoll':
    default:
      return 'sun'
  }
}

export function showYahtzeeCategoryToast({
  category,
  score,
  playerName,
  celebration,
  isBestPick = false,
  duration = 3200,
  id,
}: YahtzeeCategoryToastOptions): boolean {
  const categoryName = getCategoryDisplayName(category)
  const eyebrow = playerName?.trim() || 'Yahtzee'

  if (celebration) {
    showBoardlyMomentToast(
      {
        icon: celebration.emoji,
        eyebrow,
        title: celebration.title,
        detail: `${categoryName} banked for ${score} point${score === 1 ? '' : 's'}.`,
        badge: `+${score}`,
        tone: getCelebrationTone(celebration),
      },
      { duration, id }
    )
    return true
  }

  if (score <= 0) {
    return false
  }

  if (isBestPick) {
    showBoardlyMomentToast(
      {
        icon: '✨',
        eyebrow,
        title: 'Best category banked',
        detail: `${categoryName} was the strongest scoring line for this hand.`,
        badge: `+${score}`,
        tone: 'lav',
      },
      { duration, id }
    )
    return true
  }

  if (score >= 20) {
    showBoardlyMomentToast(
      {
        icon: '💫',
        eyebrow,
        title: 'Strong score',
        detail: `${categoryName} locked in a solid result.`,
        badge: `+${score}`,
        tone: 'mint',
      },
      { duration, id }
    )
    return true
  }

  return false
}
