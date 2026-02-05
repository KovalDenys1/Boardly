import Link from 'next/link'

export default function TermsOfService() {
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
            Terms of Service
          </h1>
          
          <div className="prose dark:prose-invert max-w-none space-y-6 text-gray-700 dark:text-gray-300">
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">1. Introduction</h2>
              <p>
                Welcome to Boardly! These Terms of Service ("Terms") govern your access to and use of our website 
                and services. By accessing or using Boardly, you agree to be bound by these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">2. Account Registration</h2>
              <p>
                To use certain features of Boardly, you may need to create an account. You agree to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Provide accurate and complete information</li>
                <li>Maintain the security of your password</li>
                <li>Notify us immediately of any unauthorized use of your account</li>
                <li>Be responsible for all activities that occur under your account</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">3. User Conduct</h2>
              <p>
                You agree not to use Boardly to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Violate any laws or regulations</li>
                <li>Harass, abuse, or harm other users</li>
                <li>Post offensive, inappropriate, or spam content</li>
                <li>Attempt to gain unauthorized access to our systems</li>
                <li>Use bots or automated scripts without permission</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">4. Intellectual Property</h2>
              <p>
                All content on Boardly, including text, graphics, logos, and software, is the property of 
                Boardly or its licensors and is protected by copyright and other intellectual property laws.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">5. Limitation of Liability</h2>
              <p>
                Boardly is provided "as is" without warranties of any kind. We are not liable for any damages 
                arising from your use of the service, including but not limited to direct, indirect, incidental, 
                or consequential damages.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">6. Termination</h2>
              <p>
                We reserve the right to suspend or terminate your account at any time, with or without notice, 
                for violations of these Terms or for any other reason.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">7. Changes to Terms</h2>
              <p>
                We may update these Terms from time to time. Continued use of Boardly after changes constitutes 
                acceptance of the updated Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">8. Contact</h2>
              <p>
                If you have questions about these Terms, please contact us through our website or support channels.
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
