import { useT } from "@/lib/i18n";
import type { FollowAttribution } from "@/lib/follow-credits";
import { useView } from "@/lib/view";

const SHOWN = 3;

/**
 * Who on this title the user follows: overlapping faces in an accent-ringed pill.
 * Renders nothing when nobody is attributed, so a card never shows an empty pill.
 */
export function FollowedPeopleChip({ people }: { people: FollowAttribution[] }) {
  const t = useT();
  const { openPerson } = useView();
  if (people.length === 0) return null;
  const first = people[0];
  const label = people.map((p) => `${p.name} (${p.role})`).join(", ");
  return (
    <button
      type="button"
      onClick={() => openPerson(first.id)}
      title={label}
      aria-label={t("People you follow: {names}", { names: label })}
      className="flex w-full min-w-0 items-center gap-1.5 rounded-full bg-accent-soft py-0.5 pe-2 ps-0.5 text-start ring-1 ring-accent/40 transition-colors hover:ring-accent"
    >
      <span className="flex shrink-0 -space-x-1.5 rtl:space-x-reverse">
        {people.slice(0, SHOWN).map((p) =>
          p.profile ? (
            <img
              key={p.id}
              src={`https://image.tmdb.org/t/p/w92${p.profile}`}
              alt=""
              loading="lazy"
              className="h-5 w-5 rounded-full object-cover ring-1 ring-accent"
            />
          ) : (
            <span
              key={p.id}
              aria-hidden
              className="flex h-5 w-5 items-center justify-center rounded-full bg-elevated text-[10px] font-semibold text-accent ring-1 ring-accent"
            >
              {p.name.slice(0, 1)}
            </span>
          ),
        )}
      </span>
      <span className="min-w-0 truncate text-[11px] font-semibold leading-none text-ink">
        {first.name}
        {people.length > 1 && <span className="text-accent"> +{people.length - 1}</span>}
      </span>
    </button>
  );
}
