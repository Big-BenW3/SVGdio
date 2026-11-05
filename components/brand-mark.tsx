import type { SVGProps } from "react";

export function BrandMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 32 32" fill="none" {...props}>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#000000" stroke="#ffea00" strokeWidth="1" />
      <rect x="7" y="8" width="18" height="4.6" rx="2.3" fill="#ffea00" />
      <rect x="10" y="13.7" width="18" height="4.6" rx="2.3" fill="#e6d400" />
      <rect x="7" y="19.4" width="18" height="4.6" rx="2.3" fill="#ccbb00" />
    </svg>
  );
}
