'use client'

import { Suspense } from 'react'
import LoginForm from './LoginForm'
import LoadingSpinner from '@/components/LoadingSpinner'
import { AuthShellLoading } from '@/components/auth/AuthShell'

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthShellLoading spinner={<LoadingSpinner />} />}>
      <LoginForm />
    </Suspense>
  )
}
