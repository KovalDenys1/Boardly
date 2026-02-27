import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'

interface JoinPromptProps {
  lobby: any
  password: string
  setPassword: (password: string) => void
  error: string | null
  onJoin: () => void
}

export default function JoinPrompt({
  lobby,
  password,
  setPassword,
  error,
  onJoin,
}: JoinPromptProps) {
  const router = useRouter()
  const { t } = useTranslation()

  return (
    <div className="max-w-2xl mx-auto w-full animate-scale-in">
      <div className="rounded-2xl border border-white/20 bg-slate-900/55 backdrop-blur-xl p-6 sm:p-8 text-center shadow-2xl">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 border border-white/20 mb-5">
          <span className="text-3xl">🎮</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
          <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-cyan-500/20 text-cyan-100 border border-cyan-300/30 font-mono">
            {lobby.code}
          </span>
          <span
            className={`text-xs font-semibold px-2 py-1 rounded-lg border ${
              lobby.isPrivate
                ? 'bg-rose-500/20 text-rose-100 border-rose-300/35'
                : 'bg-emerald-500/20 text-emerald-100 border-emerald-300/35'
            }`}
          >
            {lobby.isPrivate ? t('lobby.privateLobby') : t('lobby.publicLobby')}
          </span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">{t('lobby.joinSection.title')}</h2>
        <p className="text-white/65 text-sm sm:text-base mb-6">
          {lobby.isPrivate
            ? t('lobby.joinPromptPrivate', { lobby: lobby.name })
            : t('lobby.joinPromptPublic', { lobby: lobby.name })}
        </p>

        {lobby.isPrivate && (
          <div className="text-left mb-6">
            <label className="block font-semibold text-white/80 text-sm mb-2">
              🔒 {t('lobby.joinSection.password')}
            </label>
            <input
              type="password"
              className="w-full bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/30 px-4 py-3 focus:ring-2 focus:ring-white/40 focus:border-transparent transition-all focus-visible:outline-none"
              placeholder={t('lobby.joinSection.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onJoin()
                }
              }}
              autoFocus
            />
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-400/30 text-red-200 rounded-xl px-4 py-3 mb-6 animate-shake">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <p className="font-semibold text-sm">{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => router.push(lobby?.gameType ? `/games/${lobby.gameType}/lobbies` : '/games')}
            className="w-full px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold border border-white/20 transition-all"
          >
            {t('lobby.backToGames')}
          </button>
          <button
            onClick={onJoin}
            className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-bold shadow-xl hover:brightness-110 transition-all"
          >
            <span className="inline-flex items-center justify-center gap-2">
              <span>🚀</span>
              <span>{t('lobby.joinSection.join')}</span>
            </span>
          </button>
        </div>

        <p className="text-white/45 text-xs mt-4">
          💡 {t('lobby.joinPromptHint')}
        </p>
      </div>
    </div>
  )
}
