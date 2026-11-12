// Frame's mark: two brackets closing around a play triangle.
export function FrameMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="currentColor" aria-hidden className={className}>
      <path d="M12 46V24A12 12 0 0 1 24 12H62V26H26V46Z" />
      <path d="M88 54V76A12 12 0 0 1 76 88H38V74H74V54Z" />
      <path d="M41 36.6C41 34.4 43.4 33 45.3 34.2L66.2 47.4C68 48.5 68 51.2 66.2 52.3L45.3 65.8C43.4 67 41 65.6 41 63.4Z" />
    </svg>
  );
}
