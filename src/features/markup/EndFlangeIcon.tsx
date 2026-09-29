import type { SVGProps } from 'react';

/** A pipe ending in a bar across it, for the End flange tool (lucide-compatible sizing). */
export function EndFlangeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M4 12h12" />
      <rect x="16" y="5" width="4" height="14" rx="0.5" fill="currentColor" />
    </svg>
  );
}
