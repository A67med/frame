import { useEffect, useRef } from "react";
import { lazyView as lazy } from "@/lib/lazy-view";

const importWrapped = () => import("@/views/wrapped");
const importDetail = () => import("@/views/detail");
const importAddons = () => import("@/views/addons");
const importDiscover = () => import("@/views/discover");
const importCatalogs = () => import("@/views/catalogs");
const importPlugins = () => import("@/views/plugins");
const importAward = () => import("@/views/award");
const importCuratedList = () => import("@/views/curated-list");
const importFilter = () => import("@/views/filter");
const importBrands = () => import("@/views/brands");
const importGrid = () => import("@/views/grid");
const importPerson = () => import("@/views/person");
const importPeople = () => import("@/views/people");
const importRadar = () => import("@/views/radar");
const importFollowing = () => import("@/views/following");
const importCollection = () => import("@/views/collection");
const importEpisodeDetail = () => import("@/views/episode-detail");
const importPlayPicker = () => import("@/views/play-picker");
const importPlayer = () => import("@/views/player");
const importMovies = () => import("@/views/movies");
const importQueue = () => import("@/views/queue");
const importService = () => import("@/views/service");
const importSettings = () => import("@/views/settings");
const importShows = () => import("@/views/shows");
const importLibrary = () => import("@/views/library");
const importCommunityCollections = () => import("@/views/collections/community-hub");
const importDownloads = () => import("@/views/downloads");
const importOnboarding = () => import("@/components/onboarding");

export const MobileShell = lazy(() =>
  import("@/views/mobile/mobile-shell").then((m) => ({ default: m.MobileShell })),
);
export const WrappedView = lazy(() => importWrapped().then((m) => ({ default: m.WrappedView })));
export const DetailView = lazy(() => importDetail().then((m) => ({ default: m.DetailView })));
export const AddonsView = lazy(() => importAddons().then((m) => ({ default: m.AddonsView })));
export const Discover = lazy(() => importDiscover().then((m) => ({ default: m.Discover })));
export const Catalogs = lazy(() => importCatalogs().then((m) => ({ default: m.Catalogs })));
export const PluginsView = lazy(() => importPlugins().then((m) => ({ default: m.Plugins })));
export const AwardView = lazy(() => importAward().then((m) => ({ default: m.AwardView })));
export const CuratedListView = lazy(() =>
  importCuratedList().then((m) => ({ default: m.CuratedListView })),
);
export const FilterView = lazy(() => importFilter().then((m) => ({ default: m.FilterView })));
export const BrandsView = lazy(() => importBrands().then((m) => ({ default: m.BrandsView })));
export const GridView = lazy(() => importGrid().then((m) => ({ default: m.GridView })));
export const PersonView = lazy(() => importPerson().then((m) => ({ default: m.PersonView })));
export const PeopleView = lazy(() => importPeople().then((m) => ({ default: m.PeopleView })));
export const RadarView = lazy(() => importRadar().then((m) => ({ default: m.RadarView })));
export const FollowingView = lazy(() => importFollowing().then((m) => ({ default: m.FollowingView })));
export const CollectionView = lazy(() => importCollection().then((m) => ({ default: m.CollectionView })));
export const AddonCollectionView = lazy(() =>
  import("@/views/addon-collection").then((m) => ({ default: m.AddonCollectionView })),
);
export const EpisodeDetailView = lazy(() =>
  importEpisodeDetail().then((m) => ({ default: m.EpisodeDetailView })),
);
export const CollectionsView = lazy(() =>
  import("@/views/collections").then((m) => ({ default: m.CollectionsView })),
);
export const CommunityCollectionsView = lazy(() =>
  importCommunityCollections().then((m) => ({ default: m.CommunityCollectionsView })),
);
export const PlayPicker = lazy(() => importPlayPicker().then((m) => ({ default: m.PlayPicker })));
export const PlayerView = lazy(() => importPlayer().then((m) => ({ default: m.PlayerView })));
export const Movies = lazy(() => importMovies().then((m) => ({ default: m.Movies })));
export const QueueView = lazy(() => importQueue().then((m) => ({ default: m.QueueView })));
export const ServiceView = lazy(() => importService().then((m) => ({ default: m.ServiceView })));
export const Settings = lazy(() => importSettings().then((m) => ({ default: m.Settings })));
export const Shows = lazy(() => importShows().then((m) => ({ default: m.Shows })));
export const LibraryView = lazy(() => importLibrary().then((m) => ({ default: m.LibraryView })));
export const DownloadsView = lazy(() => importDownloads().then((m) => ({ default: m.DownloadsView })));
export const OnboardingModal = lazy(() =>
  importOnboarding().then((m) => ({ default: m.OnboardingModal })),
);
export const BigPictureShell = lazy(() =>
  import("@/views/big-picture/bp-shell").then((m) => ({ default: m.BigPictureShell })),
);

// Pages Frame dropped. Their frames still parse (old links, saved stacks), so
// landing on one goes home instead of showing an empty layer.
export const REMOVED_PAGES = new Set<string>([
  "anime",
  "anime-award",
  "calendar",
  "kids",
  "music",
  "games",
  "live",
  "vod",
  "sports",
  "match-detail",
  "manga",
  "ebook",
  "profile",
  "feed",
  "groups",
  "group",
  "list",
]);

export function useViewPreloader(tmdbKey: string) {
  const keyRef = useRef(tmdbKey);
  keyRef.current = tmdbKey;
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
    };
    const schedule = (cb: () => void) =>
      typeof win.requestIdleCallback === "function"
        ? win.requestIdleCallback(cb, { timeout: 2500 })
        : window.setTimeout(cb, 1200);
    schedule(() => {
      if (cancelled) return;
      void importDetail();
      void importPlayPicker();
      void importPlayer();
      void importSettings();
      void importAddons();
      void importDiscover();
      void importPerson();
      void importPeople();
      void importRadar();
      void importFilter();
      void importMovies();
      void importShows();
      void importQueue();
      void importAward();
      void importService();
      void importOnboarding();
      void importCatalogs();
      void importPlugins();
      void importLibrary();
      void importCommunityCollections();
      void importDownloads();
      void importGrid();
      void importWrapped();
      if (keyRef.current) {
        void import("@/lib/feed/pool").then((m) => m.getPool(keyRef.current)).catch(() => {});
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
}
