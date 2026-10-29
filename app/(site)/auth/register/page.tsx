'use client'

import { Suspense } from 'react'
import RegisterForm from './RegisterForm'
import LoadingSpinner from '@/components/LoadingSpinner'
import { AuthShellLoading } from '@/components/auth/AuthShell'

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthShellLoading spinner={<LoadingSpinner />} />}>
      <RegisterForm />
    </Suspense>
  )
}
