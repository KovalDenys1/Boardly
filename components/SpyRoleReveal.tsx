'use client'

import { useTranslation } from '@/lib/i18n-helpers'

interface RoleRevealProps {
  role: string
  location?: string
  locationRole?: string
  possibleCategories?: string[]
  onReady: () => void
  playersReady: number
  totalPlayers: number
  isReady: boolean
}

export default function SpyRoleReveal({
  role,
  location,
  locationRole,
  possibleCategories,
  onReady,
  playersReady,
  totalPlayers,
  isReady,
}: RoleRevealProps) {
  const { t } = useTranslation()

  const isSpy = role === 'Spy'

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-4 sm:p-8">
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl sm:rounded-3xl p-6 sm:p-8 max-w-md w-full text-center shadow-xl border border-white/20">
        {/* Role Title */}
        <div className="mb-6">
          <div className="text-6xl mb-4 animate-bounce-in">
            {isSpy ? '🕵️' : '👥'}
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">
            {t('spy.yourRole')}
          </h2>
          <div
            className={`text-4xl font-extrabold mb-4 ${
              isSpy ? 'text-red-300' : 'text-green-300'
            }`}
          >
            {t(isSpy ? 'spy.roles.spy' : 'spy.roles.regular')}
          </div>
        </div>

        {/* Role Information */}
        <div className="bg-black/20 rounded-xl p-6 mb-6">
          {isSpy ? (
            // Spy sees possible categories
            <div>
              <h3 className="text-white text-lg font-semibold mb-3">
                {t('spy.possibleCategories')}
              </h3>
              <div className="flex flex-wrap gap-2 justify-center">
                {possibleCategories?.map((category) => (
                  <span
                    key={category}
                    className="bg-red-500/30 text-white px-3 py-1 rounded-full text-sm"
                  >
                    {category}
                  </span>
                ))}
              </div>
              <p className="text-purple-200 text-sm mt-4">
                ⚠️ Blend in without revealing you don't know the location!
              </p>
            </div>
          ) : (
            // Regular player sees location and their specific role
            <div>
              <h3 className="text-white text-lg font-semibold mb-2">
                {t('spy.location')}
              </h3>
              <div className="text-3xl font-bold text-blue-300 mb-4">
                {location}
              </div>
              <h3 className="text-white text-lg font-semibold mb-2">
                {t('spy.roleAtLocation')}
              </h3>
              <div className="text-2xl font-bold text-green-300">
                {locationRole}
              </div>
              <p className="text-purple-200 text-sm mt-4">
                💡 Ask questions that prove you know the location!
              </p>
            </div>
          )}
        </div>

        {/* Ready Button */}
        <button
          onClick={onReady}
          disabled={isReady}
          className={`w-full py-3 px-6 rounded-xl font-semibold text-white transition-all ${
            isReady
              ? 'bg-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 shadow-lg'
          }`}
        >
          {isReady ? '✓ Ready' : t('spy.ready')}
        </button>

        {/* Players Ready Count */}
        <div className="mt-4 text-purple-200">
          {t('spy.playersReady', { count: playersReady, total: totalPlayers })}
        </div>
      </div>
    </div>
  )
}
