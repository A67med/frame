import { ProfileAvatar } from "@/chrome/account-menu/account-menu-parts";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

/** Name and picture come from the Stremio account, so they change on stremio.com. */
export function StremioProfileHeader() {
  const t = useT();
  const { user } = useAuth();
  const name = user?.fullname || user?.email?.split("@")[0] || null;
  return (
    <div className="flex items-center gap-4">
      <ProfileAvatar user={user} size="lg" />
      <div className="min-w-0">
        <h2 className="truncate text-[20px] font-semibold tracking-tight text-ink">
          {name ?? t("Your profile")}
        </h2>
        <p className="text-[13.5px] text-ink-subtle">
          {user
            ? t("Your Stremio profile")
            : t("Sign in to Stremio to use your profile here. Frame works without it too.")}
        </p>
      </div>
    </div>
  );
}
