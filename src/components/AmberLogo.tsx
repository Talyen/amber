export function AmberLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <path
          d="M12 2.25L20.25 10.5L12 21.75L3.75 10.5L12 2.25Z"
          fill="var(--amber-soft)"
          stroke="var(--amber)"
          strokeWidth="1.65"
          strokeLinejoin="round"
        />
        <path
          d="M12 2.25L15.75 10.5L12 21.75L8.25 10.5L12 2.25Z"
          fill="var(--amber)"
          fillOpacity="0.28"
        />
        <path
          d="M3.75 10.5H20.25"
          stroke="var(--amber)"
          strokeWidth="1.2"
          strokeOpacity="0.65"
        />
      </svg>
      <span className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
        Amber
      </span>
    </span>
  );
}
