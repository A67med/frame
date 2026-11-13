import { AvatarImage } from "@/components/avatar-image";
import { useT } from "@/lib/i18n";
import type { User } from "@/lib/stremio";
import { openUrl } from "@/lib/window";

const STREMIO_REGISTER_URL = "https://www.stremio.com/register";

/** Frame's only profile picture is the signed-in Stremio account's. */
export function ProfileAvatar({
  user,
  size = "md",
}: {
  user: User | null;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-7 w-7" : "h-9 w-9";
  return (
    <div className={`${dim} shrink-0 overflow-hidden rounded-full bg-elevated`}>
      <AvatarImage src={user?.avatar ?? null} className="h-full w-full object-cover" />
    </div>
  );
}

export function SubtitleText({ user }: { user: User | null }) {
  const t = useT();
  if (user) {
    return <>{t("profile.signedIn")}</>;
  }
  return (
    <>
      {t("Sign in to")}{" "}
      <span
        role="link"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          openUrl(STREMIO_REGISTER_URL);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            openUrl(STREMIO_REGISTER_URL);
          }
        }}
        className="cursor-pointer text-ink transition-colors hover:text-accent"
      >
        Stremio
      </span>
    </>
  );
}
