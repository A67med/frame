import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Trash2, User } from "lucide-react";
import { Search } from "@/components/icons/search-icon";
import { BackToTop } from "@/components/back-to-top";
import { FollowedPeopleChip } from "@/components/followed-people-chip";
import { PersonSuggestionCard } from "@/components/person-suggestion-card";
import { PickCard } from "@/components/pick-card";
import { Row, ScrollRootContext } from "@/components/row";
import { Spinner } from "@/components/spinner";
import { latestFromFollows, useFollowCredits, type FollowCredit } from "@/lib/follow-credits";
import { useFollows, type FollowedPerson, type FollowRole } from "@/lib/follows";
import { useT } from "@/lib/i18n";
import { tmdbDepartmentLabelKey } from "@/lib/providers/tmdb/tmdb-people";
import {
  discoverPeople,
  searchPeople,
  suggestCollaborators,
  type PersonHit,
  type PersonSuggestion,
} from "@/lib/radar/people";
import { localIsoDay } from "@/lib/radar/release-dates";
import { useSettings } from "@/lib/settings";
import { useScrollMemory, useView } from "@/lib/view";
import { fmtDate } from "./person/person-utils";

const ROLES: Array<{ id: FollowRole; label: string }> = [
  { id: "any", label: "Everything" },
  { id: "acting", label: "Acting" },
  { id: "directing", label: "Directing" },
];

function departmentLabel(department: string | undefined, t: ReturnType<typeof useT>): string {
  if (!department) return "";
  const key = tmdbDepartmentLabelKey(department);
  return key ? t(key) : department;
}

function Avatar({ profile, size }: { profile?: string | null; size: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-elevated text-ink-subtle"
      style={{ height: size, width: size }}
    >
      {profile ? (
        <img
          src={`https://image.tmdb.org/t/p/w185${profile}`}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <User size={Math.round(size * 0.42)} strokeWidth={1.8} />
      )}
    </span>
  );
}

function PersonSearch({
  tmdbKey,
  isFollowing,
  onAdd,
}: {
  tmdbKey: string;
  isFollowing: (id: number) => boolean;
  onAdd: (p: PersonHit) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [searched, setSearched] = useState("");

  useEffect(() => {
    const q = query.trim();
    setFailed(false);
    if (!q || !tmdbKey) {
      setResults([]);
      setSearched("");
      setBusy(false);
      return;
    }
    let cancelled = false;
    setBusy(true);
    const handle = window.setTimeout(async () => {
      try {
        const hits = await searchPeople(tmdbKey, q);
        if (!cancelled) {
          setResults(hits);
          setSearched(q);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, tmdbKey]);

  return (
    <div className="flex max-w-xl flex-col gap-2.5">
      <div className="flex h-12 items-center gap-2.5 rounded-xl bg-surface px-3.5 ring-1 ring-edge-soft focus-within:ring-accent">
        <Search size={15} className="text-ink-subtle" strokeWidth={2} />
        <input
          type="text"
          data-tv-text-field
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            tmdbKey ? t("Search actors, directors…") : t("Add a TMDB key in settings first")
          }
          disabled={!tmdbKey}
          className="h-full flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-subtle outline-none"
        />
        {busy && <Loader2 size={15} className="animate-spin text-ink-subtle" />}
      </div>
      {results.length > 0 && (
        <div className="flex flex-col gap-0.5 rounded-xl bg-surface p-1 ring-1 ring-edge-soft">
          {results.map((p) => {
            const followed = isFollowing(p.id);
            return (
              <button
                key={p.id}
                type="button"
                disabled={followed}
                onClick={() => {
                  onAdd(p);
                  setQuery("");
                  setResults([]);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-[13px] transition-colors hover:bg-elevated disabled:opacity-50"
              >
                <Avatar profile={p.profile} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{p.name}</span>
                  <span className="block truncate text-[11.5px] text-ink-subtle">
                    {[departmentLabel(p.department, t), p.knownFor].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {followed ? (
                  <span className="text-[11px] font-semibold text-accent">{t("Following")}</span>
                ) : (
                  <Plus size={15} className="text-ink-subtle" />
                )}
              </button>
            );
          })}
        </div>
      )}
      {failed && <p className="px-1 text-[13px] text-ink-subtle">{t("TMDB didn't answer.")}</p>}
      {!failed && !busy && searched && results.length === 0 && (
        <p className="px-1 text-[13px] text-ink-subtle">
          {t("Nobody on TMDB matches {query}.", { query: searched })}
        </p>
      )}
    </div>
  );
}

function PersonTile({
  person,
  department,
  onOpen,
  onRole,
  onRemove,
}: {
  person: FollowedPerson;
  department: string;
  onOpen: () => void;
  onRole: (role: FollowRole) => void;
  onRemove: () => void;
}) {
  const t = useT();
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-edge-soft">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar profile={person.profile} size={52} />
        <span className="min-w-0 text-start">
          <span className="block truncate text-[14px] font-medium text-ink">{person.name}</span>
          {department && (
            <span className="block truncate text-[12px] text-ink-subtle">{department}</span>
          )}
        </span>
      </button>
      <select
        value={person.role}
        onChange={(e) => onRole(e.target.value as FollowRole)}
        aria-label={t("What to follow")}
        className="rounded-lg bg-elevated px-2 py-1 text-[12px] text-ink ring-1 ring-edge-soft"
      >
        {ROLES.map((r) => (
          <option key={r.id} value={r.id}>
            {t(r.label)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("Unfollow")}
        title={t("Unfollow")}
        className="rounded-lg p-2 text-ink-subtle hover:bg-elevated hover:text-danger"
      >
        <Trash2 size={15} />
      </button>
    </li>
  );
}

const FollowCard = Object.assign(
  function FollowCard({ credit }: { credit: FollowCredit }) {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <PickCard
          meta={credit.meta}
          reason={credit.releaseDate ? fmtDate(credit.releaseDate) : undefined}
        />
        <FollowedPeopleChip people={credit.people} />
      </div>
    );
  },
  { isPosterCard: true as const },
);

function CreditRow({
  title,
  credits,
  scrollKey,
}: {
  title: string;
  credits: FollowCredit[];
  scrollKey: string;
}) {
  if (credits.length === 0) return null;
  return (
    <Row title={title} min={148} shape="portrait" scrollKey={scrollKey}>
      {credits.map((credit) => (
        <FollowCard key={credit.id} credit={credit} />
      ))}
    </Row>
  );
}

function usePeopleSuggestions(
  tmdbKey: string,
  people: FollowedPerson[],
  details: ReadonlyMap<number, import("@/lib/providers/tmdb").PersonDetail>,
  ready: boolean,
) {
  const [suggestions, setSuggestions] = useState<PersonSuggestion[] | null>(null);
  const [failed, setFailed] = useState(false);
  const sourceKey = people.map((p) => p.id).join(",");
  useEffect(() => {
    if (!tmdbKey || !ready) return;
    let cancelled = false;
    setFailed(false);
    const load = async (): Promise<PersonSuggestion[]> => {
      const collaborators = await suggestCollaborators(tmdbKey, people, details);
      if (collaborators.length > 0) return collaborators;
      const { actors, directors } = await discoverPeople(tmdbKey, new Set(people.map((p) => p.id)));
      return [...directors.slice(0, 4), ...actors].slice(0, 12);
    };
    load()
      .then((next) => {
        if (!cancelled) setSuggestions(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // people is re-created on every settings write; ready flips when its credits reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbKey, ready, sourceKey]);
  return { suggestions, failed };
}

export function FollowingView({ active = true }: { active?: boolean }) {
  const t = useT();
  const { settings } = useSettings();
  const { openPerson, setView, openSettings } = useView();
  const { people, isFollowing, follow, unfollow, setRole } = useFollows();
  const tmdbKey = settings.tmdbKey;
  const { credits, details, loading, failed } = useFollowCredits(tmdbKey, people);
  const latest = useMemo(() => latestFromFollows(credits, localIsoDay(Date.now())), [credits]);
  const { suggestions, failed: suggestionsFailed } = usePeopleSuggestions(
    tmdbKey,
    people,
    details,
    !loading,
  );
  const scrollRef = useRef<HTMLElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  useScrollMemory("following", scrollRef, active);
  const scrollCb = useCallback((el: HTMLElement | null) => {
    (scrollRef as { current: HTMLElement | null }).current = el;
    setScrollEl(el);
  }, []);

  return (
    <main ref={scrollCb} className="relative h-full overflow-y-auto overflow-x-hidden bg-canvas">
      <ScrollRootContext.Provider value={scrollEl}>
        <div className="flex w-full flex-col gap-10 px-12 pb-32 pt-12">
          <header>
            <h1 className="text-[34px] font-semibold tracking-tight text-ink">{t("Following")}</h1>
            <p className="mt-1 text-[14px] text-ink-subtle">
              {t("The people you follow shape For You in Radar.")}{" "}
              <button
                type="button"
                onClick={() => setView("radar")}
                className="text-accent hover:underline"
              >
                {t("Open Radar")}
              </button>
            </p>
          </header>
          {!tmdbKey && (
            <div className="flex flex-col items-start gap-3 rounded-2xl bg-surface p-6 ring-1 ring-edge-soft">
              <p className="text-[14px] text-ink">
                {t("Following reads people and credits from TMDB. Add your TMDB key to use it.")}
              </p>
              <button
                type="button"
                onClick={() => openSettings("library")}
                className="rounded-full bg-accent px-4 py-1.5 text-[13px] font-semibold text-canvas"
              >
                {t("Add TMDB key")}
              </button>
            </div>
          )}
          <PersonSearch
            tmdbKey={tmdbKey}
            isFollowing={isFollowing}
            onAdd={(p) => follow({ id: p.id, name: p.name, profile: p.profile, role: "any" })}
          />
          <section className="flex flex-col gap-3">
            <h2 className="text-[20px] font-semibold tracking-tight text-ink">
              {t("People you follow")}
            </h2>
            {people.length === 0 ? (
              <p className="text-[14px] text-ink-subtle">
                {t(
                  "You aren't following anyone yet. Search above, or use Follow on a person's page.",
                )}
              </p>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
                {people.map((p) => (
                  <PersonTile
                    key={p.id}
                    person={p}
                    department={departmentLabel(details.get(p.id)?.knownForDepartment, t)}
                    onOpen={() => openPerson(p.id)}
                    onRole={(role) => setRole(p.id, role)}
                    onRemove={() => unfollow(p.id)}
                  />
                ))}
              </ul>
            )}
          </section>
          {people.length > 0 && (
            <section className="flex flex-col gap-6">
              <h2 className="text-[20px] font-semibold tracking-tight text-ink">
                {t("Latest from people you follow")}
              </h2>
              {loading && credits.length === 0 ? (
                <div className="flex min-h-24 items-center">
                  <Spinner />
                </div>
              ) : latest.upcoming.length === 0 && latest.recent.length === 0 ? (
                <p className="text-[14px] text-ink-subtle">
                  {t("TMDB lists no recent or upcoming titles for them.")}
                </p>
              ) : (
                <>
                  <CreditRow
                    title={t("Upcoming")}
                    credits={latest.upcoming}
                    scrollKey="following:upcoming"
                  />
                  <CreditRow
                    title={t("Recently released")}
                    credits={latest.recent}
                    scrollKey="following:recent"
                  />
                </>
              )}
              {failed > 0 && (
                <p className="text-[13px] text-ink-subtle">
                  {t("TMDB didn't answer for {n} of them, so this list may be incomplete.", {
                    n: failed,
                  })}
                </p>
              )}
            </section>
          )}
          {tmdbKey &&
            (suggestionsFailed ? (
              <p className="text-[13px] text-ink-subtle">{t("TMDB didn't answer.")}</p>
            ) : (
              suggestions &&
              suggestions.length > 0 && (
                <Row
                  title={t("People you might like")}
                  headerDescription={
                    people.length > 0
                      ? t("Who the people you follow have worked with.")
                      : t("Directors and actors from what's trending this week.")
                  }
                  min={168}
                  shape="portrait"
                  scrollKey="following:suggestions"
                >
                  {suggestions.map((p) => (
                    <PersonSuggestionCard key={p.id} person={p} />
                  ))}
                </Row>
              )
            ))}
        </div>
        <BackToTop scrollRef={scrollRef} />
      </ScrollRootContext.Provider>
    </main>
  );
}
