import { LogIn, LogOut, Settings as SettingsIcon } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { AccountMenuController } from "./use-account-menu";

const ITEM =
  "flex items-center gap-2.5 px-4 py-2.5 text-start text-[13.5px] text-ink-muted transition-colors duration-150 ease-[var(--ease-out)] hover:bg-raised hover:text-ink active:scale-[0.98]";

export function AccountMenuPanel({
  ctrl,
  positionClass,
  showHeader = false,
  showSettings = false,
  onOpenSettings,
  settingsActive = false,
}: {
  ctrl: AccountMenuController;
  positionClass: string;
  showHeader?: boolean;
  showSettings?: boolean;
  onOpenSettings?: () => void;
  settingsActive?: boolean;
}) {
  const t = useT();
  const { user, signOut, setMenuOpen, setAuthOpen } = ctrl;
  const name = user?.fullname || user?.email?.split("@")[0] || t("profile.fallback");

  return (
    <div
      className={`harbor-profile-dropdown absolute z-40 overflow-hidden rounded-md bg-elevated ring-1 ring-edge shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] ${positionClass}`}
    >
      {showHeader && (
        <div className="border-b border-edge-soft px-4 py-2.5">
          <div className="truncate text-[13.5px] font-semibold text-ink">{name}</div>
          {user?.email && (
            <div className="truncate text-[11.5px] text-ink-subtle">{user.email}</div>
          )}
        </div>
      )}

      <div className="flex flex-col">
        {showSettings && onOpenSettings && (
          <button
            onClick={() => {
              onOpenSettings();
              setMenuOpen(false);
            }}
            className={`${ITEM} border-t border-edge-soft ${settingsActive ? "text-ink" : ""}`}
          >
            <SettingsIcon size={14} strokeWidth={2.2} />
            {t("nav.settings")}
          </button>
        )}
        {user ? (
          <button
            onClick={() => {
              signOut();
              setMenuOpen(false);
            }}
            className={`${ITEM} border-t border-edge-soft`}
          >
            <LogOut size={14} strokeWidth={2.2} />
            {t("profile.signOut")}
          </button>
        ) : (
          <button
            onClick={() => {
              setAuthOpen(true);
              setMenuOpen(false);
            }}
            className={`${ITEM} border-t border-edge-soft`}
          >
            <LogIn size={14} strokeWidth={2.2} />
            {t("profile.signIn")}
          </button>
        )}
      </div>
    </div>
  );
}
