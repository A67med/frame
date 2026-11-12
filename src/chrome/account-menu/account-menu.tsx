import { useState } from "react";
import { AuthModal } from "@/components/auth-modal";
import { ParentalPinModal } from "@/components/parental-pin-modal";
import { useT } from "@/lib/i18n";
import { useParental } from "@/lib/parental";
import { AccountMenuPanel } from "./account-menu-panel";
import { ProfileAvatar, SubtitleText } from "./account-menu-parts";
import { useAccountMenu } from "./use-account-menu";

type TriggerKind = "row" | "pill" | "avatar";

export function AccountMenu({
  trigger = "pill",
  placement = "down",
  align = "end",
  collapsed = false,
  showSettings = false,
  onOpenSettings,
  settingsActive = false,
  triggerClassName,
}: {
  trigger?: TriggerKind;
  placement?: "up" | "down";
  align?: "start" | "end" | "stretch";
  collapsed?: boolean;
  showSettings?: boolean;
  onOpenSettings?: () => void;
  settingsActive?: boolean;
  triggerClassName?: string;
}) {
  const t = useT();
  const ctrl = useAccountMenu();
  const { ref, user, menuOpen, setMenuOpen } = ctrl;
  const { locked, unlock } = useParental();
  const [pinForSettings, setPinForSettings] = useState(false);
  // Settings is PIN-gated in the navigation; the menu's shortcut to it must not
  // be a way around parental controls.
  const openSettings = onOpenSettings
    ? () => (locked ? setPinForSettings(true) : onOpenSettings())
    : undefined;

  const name = user?.fullname || user?.email?.split("@")[0] || t("profile.fallback");

  const vpos = placement === "up" ? "bottom-full mb-1.5" : "top-full mt-2";
  const hpos =
    trigger === "row" && !collapsed && align === "stretch"
      ? "start-2 end-2 lg:start-4 lg:end-4"
      : collapsed
        ? "start-0 w-64"
        : align === "end"
          ? "end-0 w-64"
          : align === "start"
            ? "start-0 w-64"
            : "start-0 end-0";
  const positionClass = `${vpos} ${hpos}`;

  const avatar = (size: "md" | "lg") => (
    <span className="relative inline-flex shrink-0">
      <ProfileAvatar user={user} size={size} />
    </span>
  );

  return (
    <div ref={ref} className="relative">
      {trigger === "row" ? (
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={name}
          className={
            triggerClassName ??
            `flex w-full items-center justify-center gap-3.5 rounded-xl py-2.5 text-start transition-colors hover:bg-elevated/60 ${collapsed ? "" : "lg:justify-start lg:px-3"}`
          }
        >
          {avatar("lg")}
          <div
            data-harbor-sidebar-label
            aria-hidden={collapsed || undefined}
            className={`hidden min-w-0 flex-1 ${collapsed ? "" : "lg:block"}`}
          >
            <div className="truncate text-[14.5px] font-medium tracking-tight text-ink">{name}</div>
            <div className="truncate text-[12px] text-ink-subtle">
              <SubtitleText user={user} />
            </div>
          </div>
        </button>
      ) : trigger === "avatar" ? (
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={name}
          className={
            triggerClassName ??
            "flex items-center rounded-full transition-transform active:scale-95"
          }
        >
          {avatar("md")}
        </button>
      ) : (
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={
            triggerClassName ??
            "flex h-9 items-center gap-2 rounded-full ps-1 pe-3 text-[12.5px] font-medium text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
          }
        >
          {avatar("md")}
          <span className="hidden max-w-[8rem] truncate sm:inline">{name}</span>
        </button>
      )}

      {menuOpen && (
        <AccountMenuPanel
          ctrl={ctrl}
          positionClass={positionClass}
          showHeader={trigger !== "row"}
          showSettings={showSettings}
          onOpenSettings={openSettings}
          settingsActive={settingsActive}
        />
      )}

      {ctrl.authOpen && <AuthModal onClose={() => ctrl.setAuthOpen(false)} />}
      {pinForSettings && onOpenSettings && (
        <ParentalPinModal
          mode={{
            kind: "unlock",
            onUnlock: () => {
              setPinForSettings(false);
              onOpenSettings();
            },
            onCancel: () => setPinForSettings(false),
          }}
          verify={unlock}
        />
      )}
    </div>
  );
}
