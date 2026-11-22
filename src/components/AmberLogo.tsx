import { useId } from "react";

export function AmberLogo({ className = "" }: { className?: string }) {
  const id = useId().replace(/:/g, "");

  return (
    <span className={`inline-flex items-center gap-2 select-none ${className}`}>
      <svg
        width="24"
        height="24"
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient
            id={`amber-body-${id}`}
            x1="4"
            y1="2"
            x2="24"
            y2="26"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FBBF24" />
            <stop offset="52%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#92400E" />
          </linearGradient>
          <linearGradient
            id={`amber-top-${id}`}
            x1="14"
            y1="2.5"
            x2="14"
            y2="14"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FEF3C7" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.15" />
          </linearGradient>
          <linearGradient
            id={`amber-core-${id}`}
            x1="14"
            y1="7"
            x2="14"
            y2="21.5"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FDE68A" stopOpacity="0.72" />
            <stop offset="100%" stopColor="#B45309" stopOpacity="0.45" />
          </linearGradient>
        </defs>

        {/* Outer faceted amber stone */}
        <path
          d="M14 2.25L23.5 8.25V19.75L14 25.75L4.5 19.75V8.25L14 2.25Z"
          fill={`url(#amber-body-${id})`}
        />

        {/* Upper light-catching crown facet */}
        <path
          d="M14 2.25L23.5 8.25L14 12.25L4.5 8.25L14 2.25Z"
          fill={`url(#amber-top-${id})`}
        />

        {/* Deep lower-right shadow facet for 3D depth */}
        <path
          d="M23.5 8.25V19.75L14 25.75V12.25L23.5 8.25Z"
          fill="#78350F"
          fillOpacity="0.34"
        />

        {/* Inner glowing prism core */}
        <path
          d="M14 7.5L18.75 11.75L14 20.5L9.25 11.75L14 7.5Z"
          fill={`url(#amber-core-${id})`}
        />

        {/* Crisp specular edge */}
        <path
          d="M14 2.6L23.15 8.4V19.6L14 25.4L4.85 19.6V8.4L14 2.6Z"
          stroke="#FDE68A"
          strokeOpacity="0.38"
          strokeWidth="0.75"
        />
      </svg>

      <span className="text-[16px] font-bold leading-none tracking-[-0.035em] text-[var(--text-primary)]">
        Amber
      </span>
    </span>
  );
}
