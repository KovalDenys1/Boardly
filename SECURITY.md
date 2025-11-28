# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Which versions are eligible for receiving such patches depends on the CVSS v3.0 Rating:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability within Boardly, please send an email to [security@boardly.online](mailto:security@boardly.online). All security vulnerabilities will be promptly addressed.

Please include the following information in your report:

- Type of issue (e.g., buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

This information will help us triage your report more quickly.

## Response Timeline

- **Initial Response**: Within 48 hours of receiving your report
- **Status Update**: Within 7 days with assessment and planned fix timeline
- **Fix Release**: Depends on severity
  - **Critical**: Within 24-48 hours
  - **High**: Within 7 days
  - **Medium**: Within 30 days
  - **Low**: Next regular release

## Security Update Process

1. The security report is received and assigned a primary handler
2. The problem is confirmed and a list of affected versions is determined
3. Code is audited to find any similar problems
4. Fixes are prepared for all supported releases
5. New versions are released and security advisory is published

## Public Disclosure

We practice coordinated disclosure. Once a fix is available:

1. We will publish a security advisory on GitHub
2. The vulnerability details will be shared with credit to the reporter (unless anonymity is requested)
3. A CVE ID will be requested if applicable

## Security Best Practices

While we work hard to ensure the security of Boardly, you can help protect your deployment:

### Environment Variables
- Never commit `.env` or `.env.local` files
- Use strong, random values for `JWT_SECRET` and `NEXTAUTH_SECRET`
- Rotate secrets regularly (every 90 days recommended)
- Use different secrets for development and production

### Database
- Use SSL/TLS for database connections
- Implement regular database backups
- Use connection pooling with limits
- Never expose database credentials in client-side code

### Authentication
- Enable two-factor authentication for admin accounts
- Implement rate limiting on auth endpoints (already configured)
- Monitor for suspicious login patterns
- Use secure password hashing (bcrypt with salt, already implemented)

### API Security
- Rate limiting is enabled by default on all API routes
- CSRF protection is enabled via middleware
- Keep dependencies up to date with `npm audit`
- Validate and sanitize all user inputs

### Deployment
- Always use HTTPS in production (enforced on Vercel)
- Set appropriate CORS origins (configured in `socket-server.ts`)
- Enable Sentry error tracking for monitoring
- Keep Node.js and npm/yarn versions updated

### Data Protection
- User passwords are hashed with bcrypt
- JWT tokens expire and are stored securely
- Personal data follows GDPR principles (minimal collection)
- Regular security audits of dependencies

## Known Security Considerations

### Guest Mode
- Guest users have limited privileges
- Guest data is temporary and not persisted in User table
- Guest IDs are client-generated (consider server-side generation for enhanced security)

### Socket.IO
- Real-time connections are rate-limited
- Room access is validated server-side
- Socket events are authenticated
- Consider adding connection encryption for sensitive data

### Third-Party Services
We use the following third-party services:
- **Supabase** (Database) - SOC 2 Type II certified
- **Vercel** (Frontend hosting) - Enterprise security standards
- **Render** (Socket.IO server) - Regular security updates
- **Resend** (Emails) - GDPR compliant
- **Sentry** (Error tracking) - Data encryption in transit and at rest

## Security Contact

For any security-related questions or concerns, contact:
- **Email**: security@boardly.online
- **Response Time**: Within 48 hours

## Bug Bounty Program

We currently do not have a formal bug bounty program. However, we greatly appreciate security researchers who responsibly disclose vulnerabilities and will:

- Acknowledge your contribution in our security advisories
- Provide credit in release notes
- Consider compensation for critical vulnerabilities on a case-by-case basis

## Compliance

Boardly follows these security standards:
- OWASP Top 10 Web Application Security Risks
- CWE/SANS Top 25 Most Dangerous Software Errors
- General Data Protection Regulation (GDPR) principles

---

*Last Updated: November 28, 2025*
