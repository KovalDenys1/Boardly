import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import HeroSection from '@/components/HomePage/HeroSection'
import FeaturesGrid from '@/components/HomePage/FeaturesGrid'
import HowItWorks from '@/components/HomePage/HowItWorks'

// Use ISR for better performance - revalidate every 60 seconds
export const revalidate = 60

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  const isLoggedIn = !!session

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500">
      {/* Main content with fixed layout to prevent CLS */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20" style={{ minHeight: 'calc(100vh - 64px)' }}>
        {/* Hero Section - Critical content, render immediately */}
        <HeroSection 
          isLoggedIn={isLoggedIn}
          userName={session?.user?.name}
          userEmail={session?.user?.email}
        />
        
        {/* Features Grid - Fixed height to prevent CLS */}
        <div style={{ minHeight: '300px' }}>
          <FeaturesGrid />
        </div>
        
        {/* How It Works - Fixed height to prevent CLS */}
        <div style={{ minHeight: '400px' }}>
          <HowItWorks />
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-black/20 backdrop-blur-sm py-8 mt-20" style={{ minHeight: '80px' }}>
        <div className="max-w-7xl mx-auto px-4 text-center text-white/60 text-sm">
          <p>© 2025 Boardly. Built with Next.js, Socket.IO, and Prisma.</p>
        </div>
      </footer>
    </div>
  )
}
