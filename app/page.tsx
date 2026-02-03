import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import HeroSection from '@/components/HomePage/HeroSection'

import AnimatedSection from '@/components/ui/AnimatedSection'
import FeaturesGrid from '@/components/HomePage/FeaturesGrid'
import HowItWorks from '@/components/HomePage/HowItWorks'

// Use ISR for better performance - revalidate every 60 seconds
export const revalidate = 60

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  const isLoggedIn = !!session

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 flex flex-col">
      {/* Hero Block - Full viewport height minus nav, flex centered, responsive */}
      <section
        className="flex flex-col items-center justify-center flex-shrink-0 w-full px-4"
        style={{ minHeight: 'calc(100vh - 64px)' }}
      >
        <div className="w-full max-w-3xl flex flex-col items-center justify-center h-full">
          <AnimatedSection threshold={0} animationClass="animate-scale-fade-in">
            <HeroSection
              isLoggedIn={isLoggedIn}
              userName={session?.user?.name}
              userEmail={session?.user?.email}
            />
          </AnimatedSection>
        </div>
      </section>

      {/* Main content below hero */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
        {/* Features Grid - Animated */}
        <AnimatedSection className="mb-8" threshold={0.5}>
          <FeaturesGrid />
        </AnimatedSection>
        {/* How It Works - Animated */}
        <AnimatedSection className="mb-8" threshold={0.4}>
          <HowItWorks />
        </AnimatedSection>
      </div>

      {/* Footer */}
      <footer className="bg-black/20 backdrop-blur-sm py-8 mt-auto" style={{ minHeight: '80px' }}>
        <div className="max-w-7xl mx-auto px-4 text-center text-white/60 text-sm">
          <p>© 2026 Boardly. Built with Next.js, Socket.IO, and Prisma.</p>
        </div>
      </footer>
    </div>
  )
}
