import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Read our Terms of Service to understand the rules and guidelines for using Boardly.',
  alternates: {
    canonical: 'https://boardly.online/terms',
  },
}

export default function TermsOfService() {
  return (
    <div className="bd-page bd-screen flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        <nav className="mb-6 flex items-center gap-2 text-sm" style={{ color: 'var(--bd-ink-muted)' }} aria-label="Breadcrumb">
          <Link href="/" className="transition-colors hover:text-bd-ink">Home</Link>
          <span>/</span>
          <span style={{ color: 'var(--bd-ink)' }}>Terms of Service</span>
        </nav>

        <div className="bd-card p-8 md:p-12">
          <h1
            className="mb-8 text-3xl font-extrabold leading-tight tracking-tight"
            style={{ color: 'var(--bd-ink)', fontFamily: 'var(--bd-font-display)' }}
          >
            Terms of Service
          </h1>

          <div className="space-y-8 text-sm leading-relaxed" style={{ color: 'var(--bd-ink-soft)' }}>
            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>1. Introduction</h2>
              <p>
                Welcome to Boardly! These Terms of Service (&quot;Terms&quot;) govern your access to and use of our website
                and services. By accessing or using Boardly, you agree to be bound by these Terms.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>2. Account Registration</h2>
              <p className="mb-3">To use certain features of Boardly, you may need to create an account. You agree to:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Provide accurate and complete information</li>
                <li>Maintain the security of your password</li>
                <li>Notify us immediately of any unauthorized use of your account</li>
                <li>Be responsible for all activities that occur under your account</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>3. User Conduct</h2>
              <p className="mb-3">You agree not to use Boardly to:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Violate any laws or regulations</li>
                <li>Harass, abuse, or harm other users</li>
                <li>Post offensive, inappropriate, or spam content</li>
                <li>Attempt to gain unauthorized access to our systems</li>
                <li>Use bots or automated scripts without permission</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>4. Intellectual Property</h2>
              <p>
                All content on Boardly, including text, graphics, logos, and software, is the property of
                Boardly or its licensors and is protected by copyright and other intellectual property laws.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>5. Limitation of Liability</h2>
              <p>
                Boardly is provided &quot;as is&quot; without warranties of any kind. We are not liable for any damages
                arising from your use of the service, including but not limited to direct, indirect, incidental,
                or consequential damages.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>6. Termination</h2>
              <p>
                We reserve the right to suspend or terminate your account at any time, with or without notice,
                for violations of these Terms or for any other reason.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>7. Changes to Terms</h2>
              <p>
                We may update these Terms from time to time. Continued use of Boardly after changes constitutes
                acceptance of the updated Terms.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--bd-ink)' }}>8. Contact</h2>
              <p>
                If you have questions about these Terms, please contact us through our website or support channels.
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
