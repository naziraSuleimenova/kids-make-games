export default function BricksLogo({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Bottom row — two wide bricks */}
      <rect x="0" y="18" width="18" height="14" rx="3" fill="#FF3D9A" />
      <rect x="22" y="18" width="18" height="14" rx="3" fill="#FFB800" />
      {/* Studs bottom row */}
      <circle cx="6" cy="18" r="2.5" fill="#D42F82" />
      <circle cx="13" cy="18" r="2.5" fill="#D42F82" />
      <circle cx="28" cy="18" r="2.5" fill="#E5A200" />
      <circle cx="35" cy="18" r="2.5" fill="#E5A200" />

      {/* Top row — offset brick */}
      <rect x="10" y="4" width="20" height="14" rx="3" fill="#FF6B00" />
      {/* Studs top row */}
      <circle cx="17" cy="4" r="2.5" fill="#E55A00" />
      <circle cx="24" cy="4" r="2.5" fill="#E55A00" />
    </svg>
  );
}
