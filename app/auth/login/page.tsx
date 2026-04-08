'use client'

import { Suspense } from 'react'
import LoginForm from './LoginForm'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="relative min-h-[100svh] overflow-x-hidden overflow-y-auto bg-[#070b18]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.26),transparent_32%),radial-gradient(circle_at_top_right,rgba(217,70,239,0.24),transparent_34%),radial-gradient(circle_at_bottom,rgba(59,130,246,0.18),transparent_28%)]" />
        <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:72px_72px]" />
        <div className="relative mx-auto flex min-h-[100svh] w-full box-border items-center justify-center px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <div className="mx-auto w-full max-w-5xl rounded-[32px] border border-white/30 bg-white/[0.94] p-5 text-gray-900 shadow-[0_32px_120px_rgba(2,6,23,0.65)] backdrop-blur-2xl md:min-h-[28rem] dark:border-white/10 dark:bg-slate-900/[0.94] dark:text-gray-100 sm:p-6">
            <LoadingSpinner />
          </div>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
