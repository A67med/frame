import { SettingGroup } from "./kit";
import { useSettings } from "@/lib/settings";
import { Info, Link2 } from "./icons";
import { useT } from "@/lib/i18n";
import { ROW_DESC, Section, ToggleRow } from "./shared";
import { StremioProfileHeader } from "./account/stremio-profile-header";
import { StremioCard } from "./account/stremio-card";
import { SyncedAddonsCard } from "./account/synced-addons-card";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function AccountStub() {
  const t = useT();
  return (
    <div className="harbor-cascade flex flex-col gap-10">
      <StremioProfileHeader />

      {isTauri && (
        <Section
          title={t("Stremio install links")}
          subtitle={t(
            "Frame catches stremio:// install links so the configure-and-install flow stays inside the app. Every install also syncs to your Stremio account, so the official app remains the canonical home for your library.",
          )}
        >
          <StremioDeeplinkRow />
        </Section>
      )}

      <Section
        title={t("Stremio account")}
        subtitle={t("Library, watch progress, and addon collection sync from this account.")}
      >
        <StremioCard />
      </Section>
      <Section
        title={t("Synced addons")}
        subtitle={t(
          "Frame pulls your addon collection from Stremio. Manage individual addons in Streaming sources.",
        )}
      >
        <SyncedAddonsCard />
      </Section>
    </div>
  );
}

function StremioDeeplinkRow() {
  const t = useT();
  const { settings, update } = useSettings();
  const on = settings.stremioDeeplinkInstall;
  return (
    <SettingGroup>
      <ToggleRow
        label={t("Catch stremio:// install links inside Frame")}
        sub={t(
          "Frame's in-app installer animates the manifest install and keeps you in context. Anything Frame installs is also synced to your Stremio account, so the official app stays the canonical library. Turn this off and Stremio becomes the only handler for stremio:// links; Frame still installs anything you trigger from inside the app (Configure & install, paste, drag-and-drop).",
        )}
        leading={<Link2 size={18} strokeWidth={2} />}
        value={on}
        onChange={(stremioDeeplinkInstall) => update({ stremioDeeplinkInstall })}
      />
      <div className="flex items-start gap-2.5 rounded-[10px] bg-elevated px-4 py-3">
        <Info size={18} className="mt-[2px] shrink-0 text-ink-subtle" />
        <p className={`max-w-[66ch] ${ROW_DESC}`}>
          {on
            ? t(
                "Heads up: if Stremio is also installed, Windows may ask which app to use the first time a stremio:// link fires. Pick Frame to make it stick.",
              )
            : t(
                "stremio:// links now open in the Stremio app. Frame will only install when you trigger it from inside Frame.",
              )}
        </p>
      </div>
    </SettingGroup>
  );
}
