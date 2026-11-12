import { Lock, Settings } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * Icon-only Settings control for the bottom utility group of the sidebars,
 * placed directly above the profile control. It always renders, even when
 * the profile control is replaced by the parental lock, so Settings stays
 * reachable. The caller decides what a click does (the parental PIN gate
 * lives in each shell).
 */
export function SidebarSettingsEntry({
  active,
  gated = false,
  collapsed = true,
  variant = "utility",
  onClick,
}: {
  active: boolean;
  gated?: boolean;
  collapsed?: boolean;
  /** "utility" matches Collapse and Big Picture; "rail" matches the Stremio rail. */
  variant?: "utility" | "rail";
  onClick: () => void;
}) {
  const t = useT();
  const label = t("nav.settings");
  const name = gated ? t("chrome.lockedRequiresPin", { label }) : label;
  const tone = active
    ? "bg-accent-soft text-accent"
    : variant === "rail"
      ? "text-white/35 hover:bg-white/[0.05] hover:text-white/85"
      : "text-ink-subtle hover:bg-elevated/60 hover:text-ink-muted";
  const box =
    variant === "rail"
      ? "h-11 w-16 rounded-xl"
      : collapsed
        ? "h-9 w-9 rounded-lg"
        : // Expanded rows inset their icon by px-3; keep this one on the same column.
          "h-9 w-9 rounded-lg lg:w-auto lg:self-start lg:px-3";
  const size = variant === "rail" ? 26 : 17;

  return (
    <button
      type="button"
      data-focusable="true"
      data-harbor-sidebar-settings
      onClick={onClick}
      aria-label={name}
      aria-current={active ? "page" : undefined}
      title={gated ? t("chrome.lockedShort", { label }) : label}
      className={`relative flex shrink-0 items-center justify-center transition-colors duration-150 ${box} ${tone}`}
    >
      <span data-harbor-sidebar-icon className="relative inline-flex shrink-0">
        <Settings size={size} strokeWidth={variant === "rail" ? 1.75 : 1.8} />
        {gated && (
          <span className="absolute -bottom-1 -end-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-canvas text-ink-subtle ring-1 ring-edge">
            <Lock size={8} strokeWidth={2.4} />
          </span>
        )}
      </span>
    </button>
  );
}
