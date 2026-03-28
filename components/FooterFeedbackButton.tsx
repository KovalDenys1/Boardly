'use client'

export default function FooterFeedbackButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent('open-feedback'))}
      className="text-white/50 hover:text-white text-sm transition-colors cursor-pointer bg-transparent border-0 p-0 text-left"
    >
      Send Feedback ↗
    </button>
  )
}
