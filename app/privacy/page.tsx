import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Learn how Boardly collects, uses, and protects your personal information.',
  alternates: {
    canonical: 'https://boardly.online/privacy',
  },
}

export default function PrivacyPolicy() {
  return (
    <div className="bd-page bd-screen flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        <nav className="mb-6 flex items-center gap-2 text-sm" style={{ color: 'var(--bd-ink-muted)' }} aria-label="Breadcrumb">
          <Link href="/" className="transition-colors hover:text-bd-ink">Home</Link>
          <span>/</span>
          <span style={{ color: 'var(--bd-ink)' }}>Privacy Policy</span>
        </nav>

        <div className="bd-card p-8 md:p-12">
          <h1
            className="mb-8 text-3xl font-extrabold leading-tight tracking-tight"
            style={{ color: 'var(--bd-ink)', fontFamily: 'var(--bd-font-display)' }}
          >
            Privacy Policy
          </h1>

          <div className="space-y-8 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>1. Introduction</h2>
              <p>
                At Boardly, we take your privacy seriously. This Privacy Policy explains how we collect, use,
                and protect your personal information when you use our services.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>2. Information We Collect</h2>
              <p className="mb-3">We collect the following types of information:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li><strong style={{ color: 'var(--bd-ink)' }}>Account Information:</strong> Username, email address, and password (encrypted)</li>
                <li><strong style={{ color: 'var(--bd-ink)' }}>Profile Information:</strong> Optional profile picture and display name</li>
                <li><strong style={{ color: 'var(--bd-ink)' }}>Game Data:</strong> Game statistics, match history, and scores</li>
                <li><strong style={{ color: 'var(--bd-ink)' }}>Usage Data:</strong> How you interact with our platform (pages visited, features used)</li>
                <li><strong style={{ color: 'var(--bd-ink)' }}>Technical Data:</strong> IP address, browser type, device information</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>3. How We Use Your Information</h2>
              <p className="mb-3">We use your information to:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Provide and maintain our services</li>
                <li>Create and manage your account</li>
                <li>Process game sessions and track statistics</li>
                <li>Send important notifications (game invites, account updates)</li>
                <li>Improve our platform and user experience</li>
                <li>Prevent fraud and ensure security</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>4. Data Sharing</h2>
              <p className="mb-3">We do not sell your personal information. We may share data with:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li><strong style={{ color: 'var(--bd-ink)' }}>Service Providers:</strong> Third-party services that help us operate (database hosting, email delivery)</li>
                <li><strong style={{ color: 'var(--bd-ink)' }}>OAuth Providers:</strong> When you sign in with Google, GitHub, or Discord</li>
                <li><strong style={{ color: 'var(--bd-ink)' }}>Legal Requirements:</strong> When required by law or to protect our rights</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>5. Data Security</h2>
              <p className="mb-3">We implement industry-standard security measures to protect your data:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Passwords are encrypted using bcrypt hashing</li>
                <li>HTTPS encryption for all data transmission</li>
                <li>Regular security audits and updates</li>
                <li>Access controls and authentication tokens</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>6. Your Rights</h2>
              <p className="mb-3">You have the right to:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Access your personal data</li>
                <li>Correct inaccurate data</li>
                <li>Request deletion of your account and data</li>
                <li>Opt out of optional communications</li>
                <li>Export your game data</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>7. Cookies and Tracking</h2>
              <p className="mb-3">We use cookies and similar technologies to:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Keep you logged in</li>
                <li>Remember your language preference</li>
                <li>Analyze usage patterns to improve our service</li>
              </ul>
              <p className="mt-3">
                You can control cookies through your browser settings, but some features may not work properly if disabled.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>8. Children&apos;s Privacy</h2>
              <p>
                Boardly is not intended for users under 13 years of age. We do not knowingly collect personal
                information from children. If you believe we have collected data from a child, please contact us immediately.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>9. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of significant changes
                via email or through a prominent notice on our platform.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>10. Contact Us</h2>
              <p>
                If you have questions or concerns about this Privacy Policy or your data, please contact us
                through our website or support channels.
              </p>
            </section>

            <p className="pt-4 text-xs" style={{ color: 'var(--bd-ink-muted)', borderTop: '1px solid var(--bd-line)' }}>
              Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
