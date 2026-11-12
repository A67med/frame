import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Smartphone } from "lucide-react";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { Section, ToggleRow } from "../shared";
import { SettingGroup, SettingRow, ROW_ACTION, ROW_DESC } from "../kit";
import { AddressRow } from "./server-address-section";
import { isTauri } from "./internals";

const WEB_PORT = 11471;

type PairedDevice = {
  id: string;
  name: string;
  platform: string;
  pairedAt: number;
  lastSeen: number;
};

function formatDay(ms: number): string {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * The phone remote and Frame in a browser, served on the local network, and
 * the devices allowed to control Frame. A device pairs with a code shown on
 * this screen; forgetting it disconnects it at once.
 */
export function RemoteDevicesSection() {
  const t = useT();
  const { settings, update } = useSettings();
  const enabled = settings.serveWebUi || settings.remoteControlEnabled;
  const [devices, setDevices] = useState<PairedDevice[] | null>(null);
  const [lanIp, setLanIp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (!isTauri) return;
    void invoke<PairedDevice[]>("remote_devices_list")
      .then((rows) => setDevices(Array.isArray(rows) ? rows : []))
      .catch(() => setDevices([]));
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    refresh();
    void invoke<string | null>("lan_ip")
      .then((ip) => setLanIp(ip ?? null))
      .catch(() => setLanIp(null));
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    void listen<{ action: string; reason?: string }>("remote://pair", (e) => {
      if (e.payload?.action === "hide" && e.payload.reason === "paired") refresh();
    }).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [refresh]);

  if (!isTauri) return null;

  const forget = (id: string) => {
    setBusy(true);
    void invoke("remote_device_forget", { id })
      .catch(() => {})
      .finally(() => {
        setBusy(false);
        refresh();
      });
  };

  const forgetAll = () => {
    setBusy(true);
    void invoke("remote_devices_forget_all")
      .catch(() => {})
      .finally(() => {
        setBusy(false);
        refresh();
      });
  };

  return (
    <Section title={t("Phone remote")}>
      <SettingGroup>
        <ToggleRow
          label={t("Phone remote and Frame in your browser")}
          sub={t(
            "Phones and browsers on your network can open Frame on this computer. Each device has to pair with a code shown on this screen before it can control Frame.",
          )}
          value={enabled}
          onChange={(on) => update({ serveWebUi: on, remoteControlEnabled: on })}
        />
        {enabled && lanIp && (
          <AddressRow label={t("Phone remote")} url={`http://${lanIp}:${WEB_PORT}/remote`} />
        )}
      </SettingGroup>

      <SettingGroup label={t("Paired devices")}>
        {devices && devices.length === 0 && (
          <SettingRow
            icon={<Smartphone size={18} strokeWidth={1.9} />}
            label={t("No paired devices")}
            desc={t(
              "When a phone or another Frame asks to pair, Frame shows a code here on this screen.",
            )}
          />
        )}
        {devices?.map((device) => (
          <SettingRow
            key={device.id}
            icon={<Smartphone size={18} strokeWidth={1.9} />}
            label={device.name || t("Unnamed device")}
            desc={t("Paired {date}", { date: formatDay(device.pairedAt) })}
          >
            <button
              type="button"
              disabled={busy}
              onClick={() => forget(device.id)}
              aria-label={t("Forget {name}", { name: device.name || t("Unnamed device") })}
              className={ROW_ACTION}
            >
              {t("Forget")}
            </button>
          </SettingRow>
        ))}
        {devices && devices.length > 1 && (
          <SettingRow
            label={t("Forget every device")}
            desc={t("Every phone and computer has to pair again before it can control Frame.")}
          >
            <button type="button" disabled={busy} onClick={forgetAll} className={ROW_ACTION}>
              {t("Forget all")}
            </button>
          </SettingRow>
        )}
      </SettingGroup>
      {enabled && (
        <p className={`max-w-[70ch] ${ROW_DESC}`}>
          {t(
            "Turning this off stops the local network server, so paired devices lose their connection until you turn it on again.",
          )}
        </p>
      )}
    </Section>
  );
}
