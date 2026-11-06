import { Check, Plus, User } from "lucide-react";
import { useFollows } from "@/lib/follows";
import { useT } from "@/lib/i18n";
import { tmdbDepartmentLabelKey } from "@/lib/providers/tmdb/tmdb-people";
import type { PersonSuggestion } from "@/lib/radar/people";
import { useView } from "@/lib/view";

/** A person to discover: opens their page and filmography, with a one-press follow. */
export function PersonSuggestionCard({ person }: { person: PersonSuggestion }) {
  const t = useT();
  const { openPerson } = useView();
  const { isFollowing, follow, unfollow } = useFollows();
  const following = isFollowing(person.id);
  const departmentKey = tmdbDepartmentLabelKey(person.department);
  const detail = person.workedWith
    ? t("Worked with {name}", { name: person.workedWith })
    : person.knownFor;
  return (
    <div className="flex h-full flex-col items-center gap-2 rounded-2xl bg-surface p-3 text-center ring-1 ring-edge-soft">
      <button
        type="button"
        onClick={() => openPerson(person.id)}
        className="flex w-full min-w-0 flex-col items-center gap-2"
      >
        <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-elevated text-ink-subtle">
          {person.profile ? (
            <img
              src={`https://image.tmdb.org/t/p/w185${person.profile}`}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <User size={32} strokeWidth={1.8} />
          )}
        </span>
        <span className="w-full min-w-0">
          <span className="block truncate text-[13.5px] font-medium text-ink">{person.name}</span>
          {departmentKey && (
            <span className="block truncate text-[11.5px] text-accent">{t(departmentKey)}</span>
          )}
          {detail && (
            <span className="block truncate text-[11.5px] text-ink-subtle" title={detail}>
              {detail}
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={() =>
          following
            ? unfollow(person.id)
            : follow({ id: person.id, name: person.name, profile: person.profile, role: "any" })
        }
        className={`mt-auto flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-semibold ring-1 transition-colors ${
          following
            ? "text-accent ring-accent/40 hover:ring-accent"
            : "text-ink ring-edge-soft hover:ring-edge"
        }`}
      >
        {following ? <Check size={13} strokeWidth={2.4} /> : <Plus size={13} strokeWidth={2.4} />}
        {following ? t("Following") : t("Follow")}
      </button>
    </div>
  );
}
