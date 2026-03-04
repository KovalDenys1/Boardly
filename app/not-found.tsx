'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function NotFound() {
  const router = useRouter()

  return (
    <div className="mobile-vh-100 safe-top safe-bottom safe-left safe-right relative overflow-hidden bg-slate-950 text-slate-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(56,189,248,0.25),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(16,185,129,0.2),transparent_40%)]"
      />

      <div className="relative mx-auto grid h-full w-full max-w-4xl place-items-center p-3 sm:p-5">
        <div className="w-full max-w-2xl rounded-3xl border border-white/15 bg-white/10 px-4 py-5 text-center shadow-2xl backdrop-blur-xl sm:px-7 sm:py-7">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
            Boardly • Lost Route
          </p>

          <h1 className="text-[clamp(4.5rem,22vw,9rem)] font-black leading-none tracking-tight text-transparent [text-shadow:0_0_32px_rgba(56,189,248,0.4)] bg-gradient-to-b from-cyan-200 via-sky-300 to-emerald-300 bg-clip-text">
            404
          </h1>

          <p className="mx-auto mt-3 max-w-lg text-[clamp(1rem,2.8vw,1.3rem)] font-semibold text-white">
            Page not found. This turn ended outside the board.
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-200/85 sm:text-base">
            Return to lobby list or jump home to start a new game.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
            <Link
              href="/lobby"
              className="btn bg-cyan-500 text-slate-950 hover:bg-cyan-400 focus-visible:ring-cyan-300"
            >
              Browse Lobbies
            </Link>
            <Link
              href="/"
              className="btn bg-white/15 text-white hover:bg-white/25 focus-visible:ring-white/40"
            >
              Go Home
            </Link>
            <button
              onClick={() => router.back()}
              className="btn bg-emerald-500 text-slate-950 hover:bg-emerald-400 focus-visible:ring-emerald-300 sm:col-span-2"
            >
              Go Back
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs sm:text-sm">
            <Link
              href="/lobby/create"
              className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-slate-100 transition-colors hover:bg-white/20"
            >
              Create Lobby
            </Link>
            <Link
              href="/games"
              className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-slate-100 transition-colors hover:bg-white/20"
            >
              Games
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
