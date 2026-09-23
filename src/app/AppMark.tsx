/** The app's logo mark (same artwork as public/favicon.svg). */
export function AppMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <rect width="64" height="64" rx="12" fill="#0f172a" />
      <circle cx="24" cy="26" r="10" fill="none" stroke="#38bdf8" strokeWidth="4" />
      <rect
        x="30"
        y="34"
        width="22"
        height="16"
        rx="2"
        fill="none"
        stroke="#f59e0b"
        strokeWidth="3"
        strokeDasharray="5 3"
      />
      <path d="M8 52h48" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
