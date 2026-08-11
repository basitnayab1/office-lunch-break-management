export function LunchBreakMark({
  className = "",
  size = 48,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <circle cx="32" cy="32" r="30" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="M18 22v20M18 22c0 6 4 8 4 14M22 22v8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M46 22c-4 0-6 4-6 10v10M46 22v20"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M28 34c2-4 6-4 8 0 1.5 3-1 6-4 8-3-2-5.5-5-4-8Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M32 30c-1 3 0 5 2 7M36 31c1 2.5 0 5-1.5 7"
        stroke="#fff"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}
