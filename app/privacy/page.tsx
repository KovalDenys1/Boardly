import Link from 'next/link'

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 md:p-12">
          <Link 
            href="/" 
            className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline mb-6"
          >
            ← Back to Home
          </Link>
          
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-8">
            Privacy Policy
          </h1>
          
          <div className="prose dark:prose-invert max-w-none space-y-6 text-gray-700 dark:text-gray-300">
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">1. Introduction</h2>
              <p>
                At Boardly, we take your privacy seriously. This Privacy Policy explains how we collect, use, 
                and protect your personal information when you use our services.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">2. Information We Collect</h2>
              <p>
                We collect the following types of information:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Account Information:</strong> Username, email address, and password (encrypted)</li>
                <li><strong>Profile Information:</strong> Optional profile picture and display name</li>
                <li><strong>Game Data:</strong> Game statistics, match history, and scores</li>
                <li><strong>Usage Data:</strong> How you interact with our platform (pages visited, features used)</li>
                <li><strong>Technical Data:</strong> IP address, browser type, device information</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">3. How We Use Your Information</h2>
              <p>
                We use your information to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Provide and maintain our services</li>
                <li>Create and manage your account</li>
                <li>Process game sessions and track statistics</li>
                <li>Send important notifications (game invites, account updates)</li>
                <li>Improve our platform and user experience</li>
                <li>Prevent fraud and ensure security</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">4. Data Sharing</h2>
              <p>
                We do not sell your personal information. We may share data with:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Service Providers:</strong> Third-party services that help us operate (database hosting, email delivery)</li>
                <li><strong>OAuth Providers:</strong> When you sign in with Google, GitHub, or Discord</li>
                <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">5. Data Security</h2>
              <p>
                We implement industry-standard security measures to protect your data:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Passwords are encrypted using bcrypt hashing</li>
                <li>HTTPS encryption for all data transmission</li>
                <li>Regular security audits and updates</li>
                <li>Access controls and authentication tokens</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">6. Your Rights</h2>
              <p>
                You have the right to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Access your personal data</li>
                <li>Correct inaccurate data</li>
                <li>Request deletion of your account and data</li>
                <li>Opt out of optional communications</li>
                <li>Export your game data</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">7. Cookies and Tracking</h2>
              <p>
                We use cookies and similar technologies to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Keep you logged in</li>
                <li>Remember your preferences (language, theme)</li>
                <li>Analyze usage patterns to improve our service</li>
              </ul>
              <p className="mt-4">
                You can control cookies through your browser settings, but some features may not work properly if disabled.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">8. Children's Privacy</h2>
              <p>
                Boardly is not intended for users under 13 years of age. We do not knowingly collect personal 
                information from children. If you believe we have collected data from a child, please contact us immediately.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">9. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of significant changes 
                via email or through a prominent notice on our platform.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">10. Contact Us</h2>
              <p>
                If you have questions or concerns about this Privacy Policy or your data, please contact us 
                through our website or support channels.
              </p>
            </section>

            <p className="text-sm text-gray-500 dark:text-gray-400 mt-12">
              Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
