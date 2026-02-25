import Link from 'next/link'

const ADMIN_LINKS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/games', label: 'Games' },
  { href: '/admin/audit-logs', label: 'Audit Logs' },
]

export default function AdminNav() {
  return (
    <nav className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex flex-wrap gap-2">
        {ADMIN_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/10"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
