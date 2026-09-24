/**
 * Force a password reset for every account that has a stored password hash.
 *
 * Written for the 2026-09-24 incident (the public anon key could read `Users.passwordHash`
 * through a platform-default grant, see the vault's incident record). Clearing the hash makes
 * the old password unusable; the account is unlocked again through the normal forgot-password
 * flow, which works for a user without a hash. Each affected person gets one email explaining
 * the precaution (`sendSecurityPasswordResetEmail`).
 *
 * Dry run by default: prints the count and masked addresses, writes nothing, sends nothing.
 *   tsx scripts/force-password-reset.ts --project <supabase-ref>
 *   tsx scripts/force-password-reset.ts --project <supabase-ref> --apply
 *
 * The project ref must appear in DATABASE_URL or DIRECT_URL, so a run against the wrong
 * database refuses instead of writing (`.env.local` points at dev; production needs the
 * Control Panel's URLs passed explicitly). NEXTAUTH_URL must be the public site URL because
 * it becomes the link in the email.
 */
import { prisma } from '../lib/db'
import { sendSecurityPasswordResetEmail } from '../lib/email'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 2)}***@${domain ?? '?'}`
}

async function main() {
  const apply = process.argv.includes('--apply')
  const project = arg('--project')
  const dbUrl = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? ''
  if (!project) throw new Error('--project <supabase-ref> is required')
  if (!dbUrl.includes(project)) throw new Error(`refusing: the connected database does not match --project ${project}`)
  if (apply && !/^https:\/\//.test(process.env.NEXTAUTH_URL ?? '')) throw new Error('NEXTAUTH_URL must be the public https site URL when applying')

  const users = await prisma.users.findMany({
    where: { passwordHash: { not: null }, email: { not: null } },
    select: { id: true, email: true, username: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} against ${project}: ${users.length} account(s) with a password hash`)
  for (const u of users) console.log(`  ${u.id}  ${maskEmail(u.email!)}  ${u.username ?? ''}`)
  if (!apply) {
    console.log('Nothing written, nothing sent. Re-run with --apply to clear the hashes and send the emails.')
    return
  }

  let cleared = 0
  const failedSends: string[] = []
  for (const u of users) {
    await prisma.$transaction([
      prisma.users.update({ where: { id: u.id }, data: { passwordHash: null } }),
      prisma.passwordResetTokens.deleteMany({ where: { userId: u.id } }),
    ])
    cleared += 1
    const result = await sendSecurityPasswordResetEmail(u.email!, u.username)
    if (result.success) console.log(`  sent  ${maskEmail(u.email!)}  ${'id' in result ? result.id : ''}`)
    else { failedSends.push(u.id); console.log(`  SEND FAILED  ${maskEmail(u.email!)}  ${result.error}`) }
  }
  const remaining = await prisma.users.count({ where: { passwordHash: { not: null } } })
  console.log(`cleared ${cleared} hash(es); accounts still holding a hash: ${remaining}; failed sends: ${failedSends.length}`)
  if (failedSends.length) { console.log('Users whose email failed (hash already cleared, contact by hand):', failedSends.join(', ')); process.exitCode = 2 }
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
