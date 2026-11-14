import type { ReactElement, ReactNode } from "react";

export type IconProps = { size?: number; strokeWidth?: number };

const IconBase = ({
  size = 20,
  strokeWidth = 1.7,
  children,
}: IconProps & { children: ReactNode }): ReactElement => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
);

export function IconChevronRight(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M9 5l7 7-7 7" />
    </IconBase>
  );
}

export function IconStorage(p: IconProps) {
  return (
    <IconBase {...p}>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
      <path d="M4.5 5.5v13c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8v-13" />
      <path d="M4.5 12c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8" />
    </IconBase>
  );
}

export function IconBasics(p: IconProps) {
  return (
    <IconBase {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.8 8.2l-2.3 5.3-5.3 2.3 2.3-5.3z" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="var(--color-canvas)" stroke="none" />
    </IconBase>
  );
}

export function IconStreamBadges(p: IconProps) {
  return (
    <IconBase {...p}>
      <rect x="3" y="10" width="18" height="9.5" rx="2.5" />
      <path d="M7 14.75h3.2" />
      <path d="M13.6 14.75h3.4" />
      <path d="M17.5 3.2v3.6" />
      <path d="M15.7 5h3.6" />
      <path
        d="M6.5 5.5l.6 1.3 1.3.6-1.3.6-.6 1.3-.6-1.3-1.3-.6 1.3-.6z"
        fill="currentColor"
        stroke="none"
      />
    </IconBase>
  );
}

export function IconAward(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M8 4h8v3a4 4 0 0 1-8 0V4z" />
      <path d="M8 5H6a2 2 0 0 0 2 3" />
      <path d="M16 5h2a2 2 0 0 1-2 3" />
      <path d="M12 11v4" />
      <path d="M9.5 15h5" />
      <path d="M8 20h8" />
      <path d="M9.8 15 9 20" />
      <path d="M14.2 15 15 20" />
      <path
        d="M12 4.9l.62 1.3 1.43.19-1.04.98.25 1.42L12 8.29l-1.26.69.25-1.42-1.04-.98 1.43-.19z"
        fill="currentColor"
        stroke="none"
      />
    </IconBase>
  );
}

export function IconAccount(p: IconProps) {
  return (
    <IconBase {...p}>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2.5" />
      <circle cx="12" cy="9.8" r="2.6" />
      <path d="M7.6 17.6c.9-2 2.6-3 4.4-3s3.5 1 4.4 3" />
    </IconBase>
  );
}

export function IconLibrary(p: IconProps) {
  return (
    <IconBase {...p}>
      <rect x="3.5" y="3.5" width="7.5" height="9" rx="1.4" />
      <rect x="13" y="3.5" width="7.5" height="6" rx="1.4" />
      <rect x="3.5" y="14.5" width="7.5" height="6" rx="1.4" />
      <rect x="13" y="11" width="7.5" height="9.5" rx="1.4" />
    </IconBase>
  );
}

export function IconStreaming(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M12 5v14" strokeWidth={p.strokeWidth ?? 2} />
      <path d="M5 12h14" strokeWidth={p.strokeWidth ?? 2} />
    </IconBase>
  );
}

export function IconFilters(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M4 5.5h16l-6.1 7.2v5.2l-3.8 1.9v-7.1z" />
    </IconBase>
  );
}

export function IconP2P(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M16.6 6.8l2.8-1.2M16.8 10.4l2.6 1.1" strokeWidth="1.4" />
      <path d="M7.4 6.8 4.6 5.6M7.2 10.4 4.6 11.5" strokeWidth="1.4" />
      <path d="M12 3.2 13.7 6h-3.4z" fill="currentColor" stroke="none" />
      <rect x="9.9" y="6" width="4.2" height="2.7" rx="0.5" />
      <path d="M9 20.6 10.3 8.7h3.4L15 20.6z" />
      <path d="M9.6 12.4h4.8" />
      <path d="M7.3 20.6h9.4" strokeLinecap="round" />
    </IconBase>
  );
}

export function IconLanguages(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M3.5 6.5h7" />
      <path d="M7 4.5v2" />
      <path d="M9.5 6.5c-.5 4-2.4 6.5-6 7.5" />
      <path d="M4 11.5c1.6 1.5 3.6 2.5 6 2.8" />
      <path d="M13 20l3.5-9 3.5 9" />
      <path d="M14.2 17.2h4.6" />
    </IconBase>
  );
}

export function IconSubtitles(p: IconProps) {
  return (
    <IconBase {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M6.5 14h4" />
      <path d="M13 14h4.5" />
      <path d="M6.5 10.5h3" />
      <path d="M12 10.5h5.5" />
    </IconBase>
  );
}

export function IconVideoTune(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M4 7h9M18.5 7H20" />
      <circle cx="15.5" cy="7" r="2" fill="currentColor" stroke="none" />
      <path d="M4 12h2.5M11.5 12H20" />
      <circle cx="8.5" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M4 17h7.5M16.5 17H20" />
      <circle cx="13.5" cy="17" r="2" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function IconShaders(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M11 3.5L5.5 17H16.5Z" />
      <path d="M2.5 10.5H8" />
      <path d="M14 11.5L21.5 9M14 11.5L21.5 12.5M14 11.5L21.5 16" />
    </IconBase>
  );
}

export function IconAnime(p: IconProps) {
  return (
    <IconBase {...p}>
      <path
        d="M9.5 3l1.6 4.4 4.4 1.6-4.4 1.6L9.5 15l-1.6-4.4L3.5 9l4.4-1.6z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M17 13l.8 2.2 2.2.8-2.2.8L17 19l-.8-2.2-2.2-.8 2.2-.8z"
        fill="currentColor"
        stroke="none"
      />
    </IconBase>
  );
}

export function IconPlayer(p: IconProps) {
  return (
    <IconBase {...p}>
      <rect x="3" y="4.5" width="18" height="13" rx="2" />
      <path d="M10 9.2l4.8 2.8-4.8 2.8z" fill="currentColor" stroke="none" />
      <path d="M7 20.5h10" />
    </IconBase>
  );
}

export function IconPlayerLayout(p: IconProps) {
  return (
    <IconBase {...p}>
      <rect x="3" y="4.5" width="18" height="13" rx="2" />
      <path d="M3 14.5h18" />
      <circle cx="7" cy="17" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="17" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14" cy="17" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function IconAdvanced(p: IconProps) {
  return (
    <IconBase {...p}>
      <path
        d="M14.7 6.3a3.6 3.6 0 0 0-4.4 4.9l-5.7 5.7a1.7 1.7 0 0 0 2.4 2.4l5.7-5.7a3.6 3.6 0 0 0 4.9-4.4l-2.4 2.4-2-.5-.5-2z"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </IconBase>
  );
}

export function IconUpdates(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M12 3v10" />
      <path d="m8 9.5 4 4 4-4" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </IconBase>
  );
}

export function IconBug(p: IconProps) {
  return (
    <IconBase {...p}>
      <rect x="7.5" y="7.5" width="9" height="11" rx="4.5" />
      <path d="M9 4.5l1.5 2.5M15 4.5l-1.5 2.5" />
      <path d="M3.5 11.5h4M16.5 11.5h4" />
      <path d="M3.5 16.5l3-1.5M16.5 15l4 1.5" />
      <path d="M3.5 7l3 2M20.5 7l-3 2" />
    </IconBase>
  );
}

export function IconSupport(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M12 20.5s-7.5-4.3-7.5-9.4A4.1 4.1 0 0 1 12 8.4a4.1 4.1 0 0 1 7.5 2.7c0 5.1-7.5 9.4-7.5 9.4z" />
    </IconBase>
  );
}

export function IconTheme(p: IconProps) {
  return (
    <IconBase {...p}>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17 2.5 2.5 0 0 0 2.5-2.5c0-.7-.3-1.3-.7-1.8-.4-.5-.7-1-.7-1.7a2.5 2.5 0 0 1 2.5-2.5h1.4a4 4 0 0 0 4-4 8.5 8.5 0 0 0-9-4.5z" />
      <circle cx="7.5" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="9.5" r="1.1" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function IconLetterboxd(p: IconProps) {
  return (
    <IconBase {...p}>
      <circle cx="5" cy="12" r="3.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="3.5" fill="currentColor" stroke="none" />
    </IconBase>
  );
}
