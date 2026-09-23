import type { SVGProps } from 'react';

/** Bow-tie valve symbol with an actuator, used for the ESDV tool (lucide-compatible sizing). */
export function EsdvIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M3 9v10l9-5z" />
      <path d="M21 9v10l-9-5z" />
      <path d="M12 14V6" />
      <path d="M8 6h8" />
    </svg>
  );
}
