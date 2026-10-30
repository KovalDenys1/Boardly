export type DocumentSection = { id: string; title: string }

/** Jump links to a long document's sections, placed under its title (#1561). */
export default function DocumentContents({ label, sections }: { label: string; sections: DocumentSection[] }) {
  return (
    <nav aria-label={label} className="mb-8 rounded-bd-md border border-bd-line bg-bd-bg px-4 py-3 sm:px-5 sm:py-4">
      <p className="bd-kicker mb-1.5">{label}</p>
      <ul className="space-y-0.5 text-sm">
        {sections.map(({ id, title }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className="inline-flex min-h-6 items-center rounded-md py-0.5 text-bd-ink underline decoration-bd-line underline-offset-4 transition-colors hover:decoration-bd-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep"
            >
              {title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
