import type { CSSProperties } from 'react'
import {
  ArrowLeft, ArrowRight, ArrowsClockwise, Butterfly, Cards, ChartBar, Check, ClipboardText, Clock, Confetti, Copy, Crown,
  Diamond, DiceFive, Eraser, FilmSlate, Flag, Flower, EnvelopeSimple, Eye, EyeSlash, Fire, GameController, Globe, HandFist, HandPalm, HandPointing,
  Camera, ChatCircle, Drop, GearSix, Handshake, Heart, Hourglass, House, Info, Laptop, Lightbulb, Lightning, Link, Lock,
  MagnifyingGlass, Megaphone, Palette,
  MapTrifold, MaskHappy, Medal, Minus, Pause, PencilSimple, Play, Plus, Question, Robot, RocketLaunch, Scissors, SkipBack, SkipForward,
  ShieldCheck, Smiley, SmileyAngry, SmileyMeh, Sparkle, SpeakerHigh, SpeakerSlash, Star, Tag, Target,
  Trash, Trophy, User, Users, Warning, X,
} from '@phosphor-icons/react/dist/ssr'
import type { Icon as PhosphorIcon, IconWeight } from '@phosphor-icons/react'
import type { IconName } from './names'

/**
 * Boardly's chrome icon – a Phosphor icon (MIT) behind a stable, Boardly-owned
 * name, in the `fill` weight by default so it matches the filled, rounded,
 * slightly chunky game icons and the B-tile. Coloured only through
 * `currentColor` or a token (`tone`), so dark mode and the premium lobby
 * themes need no per-icon work.
 *
 * Decorative by default (aria-hidden). Pass `label` when the icon is the
 * only thing conveying meaning (an icon-only button, a status without text).
 *
 * The `dist/ssr` entry renders in Server and Client Components alike.
 */
const GLYPHS: Record<IconName, PhosphorIcon> = {
  check: Check,
  close: X,
  plus: Plus,
  minus: Minus,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  play: Play,
  pause: Pause,
  'skip-back': SkipBack,
  'skip-forward': SkipForward,
  info: Info,
  warning: Warning,
  question: Question,
  search: MagnifyingGlass,
  copy: Copy,
  refresh: ArrowsClockwise,
  megaphone: Megaphone,
  clipboard: ClipboardText,
  link: Link,
  mail: EnvelopeSimple,
  chat: ChatCircle,
  eye: Eye,
  'eye-off': EyeSlash,
  'sound-on': SpeakerHigh,
  'sound-off': SpeakerSlash,
  user: User,
  users: Users,
  crown: Crown,
  star: Star,
  sparkle: Sparkle,
  heart: Heart,
  lock: Lock,
  shield: ShieldCheck,
  trophy: Trophy,
  medal: Medal,
  flame: Fire,
  bolt: Lightning,
  gem: Diamond,
  gamepad: GameController,
  dice: DiceFive,
  cards: Cards,
  mask: MaskHappy,
  target: Target,
  hourglass: Hourglass,
  clock: Clock,
  rock: HandFist,
  paper: HandPalm,
  scissors: Scissors,
  robot: Robot,
  'bot-easy': Smiley,
  'bot-medium': SmileyMeh,
  'bot-hard': SmileyAngry,
  home: House,
  map: MapTrifold,
  globe: Globe,
  laptop: Laptop,
  rocket: RocketLaunch,
  bulb: Lightbulb,
  pencil: PencilSimple,
  eraser: Eraser,
  trash: Trash,
  flag: Flag,
  point: HandPointing,
  chart: ChartBar,
  gear: GearSix,
  palette: Palette,
  camera: Camera,
  drop: Drop,
  tag: Tag,
  party: Confetti,
  butterfly: Butterfly,
  film: FilmSlate,
  flower: Flower,
  handshake: Handshake,
}

export type IconTone =
  | 'current'
  | 'ink'
  /** Ink on an accent fill — stays dark in both themes. */
  | 'on-accent'
  | 'soft'
  | 'muted'
  | 'coral'
  | 'mint'
  | 'sun'
  | 'lav'
  | 'sky'
  | 'premium'
  | 'bg'

const TONE_VAR: Record<Exclude<IconTone, 'current'>, string> = {
  ink: 'var(--bd-ink)',
  'on-accent': 'var(--bd-ink-on-accent)',
  soft: 'var(--bd-ink-soft)',
  muted: 'var(--bd-ink-muted)',
  coral: 'var(--bd-coral)',
  mint: 'var(--bd-mint)',
  sun: 'var(--bd-sun)',
  lav: 'var(--bd-lav)',
  sky: 'var(--bd-sky)',
  premium: 'var(--bd-premium)',
  bg: 'var(--bd-bg)',
}

export interface IconProps {
  name: IconName
  /** Rendered width and height in px. 16 for chips, 20 for inline text, 24 for buttons. */
  size?: number
  tone?: IconTone
  /** Phosphor weight. `fill` is the house style; `bold` for line icons next to text; `duotone` for large empty states. */
  weight?: IconWeight
  /** Accessible name. Omit for decorative icons next to visible text. */
  label?: string
  className?: string
  style?: CSSProperties
}

export default function Icon({ name, size = 20, tone = 'current', weight = 'fill', label, className, style }: IconProps) {
  const Glyph = GLYPHS[name]
  const color = tone === 'current' ? 'currentColor' : TONE_VAR[tone]
  return (
    <Glyph
      size={size}
      weight={weight}
      color={color}
      alt={label}
      aria-hidden={label ? undefined : true}
      data-icon={name}
      className={className}
      style={{ display: 'inline-block', flexShrink: 0, verticalAlign: 'middle', ...style }}
    />
  )
}
