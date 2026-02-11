'use client'

import { useTranslation } from 'react-i18next'
import Link from 'next/link'

export default function RockPaperScissorsLobbiesPage() {
    const { t } = useTranslation()

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <Link href="/games" className="text-blue-400 hover:text-blue-300 mb-4 inline-block">
                        ← {t('nav.back')}
                    </Link>
                </div>

                {/* Game Info Card */}
                <div className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-2xl p-8 mb-8 border border-indigo-500/30">
                    <h1 className="text-4xl font-bold text-white mb-4">
                        🍂 {t('games.rock_paper_scissors.name')}
                    </h1>
                    <p className="text-gray-300 mb-6">
                        {t('games.rock_paper_scissors.description')}
                    </p>

                    {/* Game Rules */}
                    <div className="bg-slate-800/50 rounded-xl p-6 border border-indigo-500/20 mb-6">
                        <h2 className="text-xl font-bold text-indigo-300 mb-4">{t('common.rules')}</h2>
                        <ul className="space-y-3 text-gray-300">
                            <li className="flex items-start gap-3">
                                <span className="text-indigo-400 font-bold">•</span>
                                <span>{t('games.rock_paper_scissors.rule_1')}</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="text-indigo-400 font-bold">•</span>
                                <span>{t('games.rock_paper_scissors.rule_2')}</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="text-indigo-400 font-bold">•</span>
                                <span>{t('games.rock_paper_scissors.rule_3')}</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="text-indigo-400 font-bold">•</span>
                                <span>{t('games.rock_paper_scissors.rule_4')}</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="text-indigo-400 font-bold">•</span>
                                <span>{t('games.rock_paper_scissors.rule_5')}</span>
                            </li>
                        </ul>
                    </div>

                    {/* Coming Soon */}
                    <div className="bg-amber-900/30 border border-amber-500/50 rounded-lg p-4 text-center">
                        <p className="text-amber-100">{t('common.coming_soon')}</p>
                        <p className="text-amber-200 text-sm mt-2">{t('game.in_development')}</p>
                    </div>
                </div>

                {/* Feature Highlights */}
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div className="bg-slate-800 rounded-lg p-4 text-center border border-slate-700">
                        <div className="text-3xl mb-2">⚡</div>
                        <p className="text-sm text-gray-300">{t('games.rock_paper_scissors.feature_quick')}</p>
                    </div>
                    <div className="bg-slate-800 rounded-lg p-4 text-center border border-slate-700">
                        <div className="text-3xl mb-2">👥</div>
                        <p className="text-sm text-gray-300">{t('games.rock_paper_scissors.feature_players')}</p>
                    </div>
                    <div className="bg-slate-800 rounded-lg p-4 text-center border border-slate-700">
                        <div className="text-3xl mb-2">🎯</div>
                        <p className="text-sm text-gray-300">{t('games.rock_paper_scissors.feature_strategy')}</p>
                    </div>
                    <div className="bg-slate-800 rounded-lg p-4 text-center border border-slate-700">
                        <div className="text-3xl mb-2">🚀</div>
                        <p className="text-sm text-gray-300">{t('games.rock_paper_scissors.feature_instant')}</p>
                    </div>
                </div>
            </div>
        </div>
    )
}
