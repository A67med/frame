import { hasBackHandlers } from "@/lib/back-intercept";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FloatingBack } from "@/chrome/floating-back";
import { ensureCuratedLogos } from "@/lib/curated-logos";
import { WindowControls } from "@/chrome/window-controls";
import { HybridTitleBar } from "@/chrome/hybrid-title-bar";
import { WindowResizeEdges } from "@/chrome/window-resize-edges";
import { MinUIDock } from "@/chrome/minui-dock";
import { Sidebar } from "@/chrome/sidebar";
import { DraculaSidebar } from "@/chrome/dracula-sidebar";
import { NordSidebar } from "@/chrome/nord-sidebar";
import { ForestSidebar } from "@/chrome/forest-sidebar";
import { RoyalTopbar } from "@/chrome/royal-topbar";
import { SideRail } from "@/chrome/siderail";
import { StremioRail } from "@/chrome/stremio-rail";
import { TopDock } from "@/chrome/topdock";
import { CinematicOverlay } from "@/chrome/cinematic-overlay";
import { Topbar, TogetherButton } from "@/chrome/topbar";
import { TabHotkeys } from "@/chrome/tab-hotkeys";
import { startMaintenance } from "@/lib/maintenance";
import { MiddleClickScroll } from "@/lib/use-middle-click-scroll";
import { exitWindowFullscreenOnPlayerClose, toggleWindowFullscreen } from "@/lib/fullscreen-state";
import { flushCloudSync } from "@/views/player/hooks/use-stremio-sync";
import { startWriteQueueFlusher } from "@/lib/stremio-write-queue";
import { setNativeMemoryActive } from "@/lib/native-memory";
import { useOverlayPinned } from "@/lib/overlay-pin";
import { isMobileWeb, isRemoteRoute } from "@/lib/platform";
import { makeSafeTauriUnlisten } from "@/lib/tauri-unlisten";
import { activeLayout } from "@/lib/theme";
import { useThemePreview } from "@/lib/theme-preview";
import { DevErrorTrigger } from "@/components/dev-error-trigger";
import { ErrorView } from "@/components/error-view";
import { HarborErrorBoundary } from "@/components/error-boundary";
import { ContextMenu } from "@/components/context-menu";
import { WatchLocalModal } from "@/components/player/watch-local-modal";
import { LocalEpisodesModal } from "@/components/player/local-episodes-modal";
import { LocalVersionsModal } from "@/components/player/local-versions-modal";
import { CurfewGuard } from "@/components/curfew-guard";
import { HoverPreview } from "@/components/hover-preview";
import { CustomHoverCssMount } from "@/components/custom-hover-css-mount";
import { EmbedViewportRoot } from "@/components/embed-viewport";
import { InstallerViewportRoot } from "@/components/installer-viewport";
import { UpdateRoot } from "@/components/update/update-root";
import { VoyageRoot } from "@/components/voyage/voyage-root";
import { ScreensaverRoot } from "@/components/screensaver/screensaver-root";
import { CustomCodeMount } from "@/components/custom-code-mount";
import { MemoryHud } from "@/components/memory-hud";
import { OfflineBanner } from "@/chrome/offline-banner";
import { ListToastHost } from "@/components/lists/list-toast";
import { DiagnosticsConsentHost } from "@/components/diagnostics/diagnostics-consent-host";
import { AnnouncementGlobal } from "@/components/announcement-global";
import { TogetherHostLeavingPrompt } from "@/components/together-host-leaving-prompt";
import { TogetherInviteToast } from "@/components/together-invite-toast";
import { TogetherSummonToast } from "@/components/together-summon-toast";
import { TogetherParticipantLeftToast } from "@/components/together-participant-left-toast";
import { ThemeBackdrop } from "@/components/theme-backdrop";
import { TopRankModal } from "@/components/top-rank-modal";
import { AuthProvider } from "@/lib/auth";
import { ProfilesProvider, useProfiles } from "@/lib/profiles";
import { RemindersRunner } from "@/lib/reminders-runner";
import { RemoteHostMount } from "@/lib/remote/host-mount";
import { RemotePairPrompt } from "@/lib/remote/pair-prompt";
import { RemoteOpenBridge } from "@/lib/remote/remote-open-bridge";
import { ControllerConnectedToast } from "@/components/controller-connected-toast";
import { GamepadRunner } from "@/components/gamepad-runner";
import { ProfileIdentitySync } from "@/lib/profile-identity-sync";
import { HarborAvatarSync } from "@/components/harbor-avatar-sync";
import { HarborNameSync } from "@/components/harbor-name-sync";
import { SettingsProfileBridge } from "@/lib/settings-profile-bridge";
import { TrackerProfileBridge } from "@/lib/tracker-profile-bridge";
import { WatchlistSync } from "@/lib/watchlist-sync";
import { ContextMenuProvider } from "@/lib/context-menu";
import { TopRankModalProvider } from "@/lib/top-rank-modal";
import { OnboardingProvider } from "@/lib/onboarding";
import { RankingsProvider } from "@/lib/rankings";
import { SettingsProvider } from "@/lib/settings";
import { SearchProvider, useSearch } from "@/lib/search-context";
import { SearchOverlay } from "@/components/search/search-overlay";
import { SearchHotkey } from "@/components/search/search-hotkey";
import { LinkOutInterstitial } from "@/components/link-out-interstitial";
import { TogetherProvider } from "@/lib/together/provider";
import { DvrProvider } from "@/lib/dvr/provider";
import { FavoritesProvider } from "@/lib/iptv/favorites";
import { MediaFavoritesProvider } from "@/lib/media-favorites";
import { CharacterFavoritesProvider } from "@/lib/character-favorites";
import { MangaFavoritesProvider } from "@/lib/manga-favorites";
import { LocalWatchlistProvider } from "@/lib/local-watchlist";
import { useSettings } from "@/lib/settings";
import {
  flushPendingTorrentRemovals,
  reconcilePendingTorrentRemovals,
  torrentEngineSetOptions,
} from "@/lib/torrent/local-engine";
import {
  effectiveBinding,
  eventToBinding,
  findHotkeyMatch,
  shouldHandleGlobalKeyboardEvent,
} from "@/lib/hotkeys";
import { ViewProvider, useView, type Frame, type View } from "@/lib/view";
import { ThemeChromeBridge } from "@/components/theme-chrome-bridge";
import type { MetaType } from "@/lib/cinemeta";
import { usePluginCataloguesAvailable } from "@/lib/streams/plugins/available";
import { SpooktoberHome } from "@/views/spooktober/spooktober-home";
import { ParentalProvider } from "@/lib/parental";
import { TraktProvider } from "@/lib/trakt/provider";
import { AnilistProvider } from "@/lib/anilist/provider";
import { MalProvider } from "@/lib/mal/provider";
import { SimklProvider } from "@/lib/simkl/provider";
import { LetterboxdProvider } from "@/lib/stremboxd/provider";
import {
  useKeyboardNavigation,
  tvFocus,
  focusTvPageDefault,
  isVisible,
} from "@/lib/keyboard-navigation";
import { enterBigPicture, useBigPicture } from "@/lib/big-picture";
import { moveMainToMonitor } from "@/lib/monitors";
import { BpErrorBoundary } from "@/views/big-picture/bp-error-boundary";
import { shouldAutoStartBigPicture, shouldOfferBigPicture } from "@/views/big-picture/bp-logic";
import { BigPictureEntryButton } from "@/views/big-picture/bp-entry-button";
import { releaseBigPictureFullscreen } from "@/views/big-picture/use-bp-fullscreen";
import { getNavFocusTarget } from "@/lib/keyboard-navigation/geometry";
import { SFX } from "@/lib/sfx";
import { startMediaSessionWindowTracking } from "@/lib/media-session";
import {
  AddonCollectionView,
  AddonsView,
  AwardView,
  BigPictureShell,
  BrandsView,
  Catalogs,
  CollectionView,
  CollectionsView,
  CommunityCollectionsView,
  CuratedListView,
  DetailView,
  Discover,
  DownloadsView,
  EpisodeDetailView,
  FilterView,
  FollowingView,
  GridView,
  LibraryView,
  MobileShell,
  Movies,
  OnboardingModal,
  PeopleView,
  PersonView,
  PlayPicker,
  PlayerView,
  PluginsView,
  QueueView,
  RadarView,
  REMOVED_PAGES,
  ServiceView,
  Settings,
  Shows,
  useViewPreloader,
  WrappedView,
} from "@/app/views";
import {
  filterReactKey,
  parseDeepLinkEpisode,
  useIdleEvict,
  useKeepAlive,
} from "@/app/layer-lifecycle";
import { clampUiScale, UI_SCALE_ACTIVITY_EVENT, UI_SCALE_STEP } from "@/app/ui-scale";
import {
  AutoDownloadRunner,
  RevealOnMount,
  TogetherFloater,
  TogetherLocationPublisher,
} from "@/app/runners";

export function App({ onReady }: { onReady?: () => void }) {
  return (
    <SettingsProvider syncTorrentEnginePolicy>
      <ProfilesProvider>
        <ParentalProvider>
          <TraktProvider>
            <AnilistProvider>
              <MalProvider>
                <SimklProvider>
                  <LetterboxdProvider>
                    <RankingsProvider>
                      <AuthProvider>
                        <OnboardingProvider>
                          <TogetherProvider>
                            <ViewProvider>
                              <SearchProvider>
                                <DvrProvider>
                                  <FavoritesProvider>
                                    <MediaFavoritesProvider>
                                      <CharacterFavoritesProvider>
                                        <MangaFavoritesProvider>
                                          <LocalWatchlistProvider>
                                            <ContextMenuProvider>
                                              <TopRankModalProvider>
                                                <HarborErrorBoundary>
                                                  <ProfileIdentitySync />
                                                  <HarborAvatarSync />
                                                  <HarborNameSync />
                                                  <SettingsProfileBridge />
                                                  <TrackerProfileBridge />
                                                  <MiddleClickScroll />
                                                  <ThemeBackdrop />
                                                  <WatchlistSync />
                                                  {isMobileWeb() || isRemoteRoute() ? (
                                                    <>
                                                      <Suspense fallback={null}>
                                                        <MobileShell />
                                                      </Suspense>
                                                      <RevealOnMount onReady={onReady} />
                                                    </>
                                                  ) : (
                                                    <Shell onReady={onReady} />
                                                  )}
                                                  {!isMobileWeb() && !isRemoteRoute() && (
                                                    <Suspense fallback={null}>
                                                      <OnboardingModal />
                                                    </Suspense>
                                                  )}
                                                  <TogetherInviteToast />
                                                  <TogetherFloater />
                                                  <TogetherHostLeavingPrompt />
                                                  <TogetherSummonToast />
                                                  <TogetherParticipantLeftToast />
                                                  <ListToastHost />
                                                  <DiagnosticsConsentHost />
                                                  <TogetherLocationPublisher />
                                                  <AutoDownloadRunner />
                                                  <RemindersRunner />
                                                  <RemoteHostMount />
                                                  <RemotePairPrompt />
                                                  <RemoteOpenBridge />
                                                  <GamepadRunner />
                                                  <ControllerConnectedToast />
                                                  <ContextMenu />
                                                  <AnnouncementGlobal />
                                                  <WatchLocalModal />
                                                  <LocalEpisodesModal />
                                                  <LocalVersionsModal />
                                                  <HoverPreview />
                                                  <CustomHoverCssMount />
                                                  <TopRankModal />
                                                  <CurfewGuard />
                                                  <SearchOverlay />
                                                  <SearchHotkey />
                                                  <LinkOutInterstitial />
                                                  <EmbedViewportRoot />
                                                  <InstallerViewportRoot />
                                                  <UpdateRoot />
                                                  <VoyageRoot />
                                                  <ScreensaverRoot />
                                                </HarborErrorBoundary>
                                                <ErrorView />
                                                <DevErrorTrigger />
                                              </TopRankModalProvider>
                                            </ContextMenuProvider>
                                          </LocalWatchlistProvider>
                                        </MangaFavoritesProvider>
                                      </CharacterFavoritesProvider>
                                    </MediaFavoritesProvider>
                                  </FavoritesProvider>
                                </DvrProvider>
                              </SearchProvider>
                            </ViewProvider>
                          </TogetherProvider>
                        </OnboardingProvider>
                      </AuthProvider>
                    </RankingsProvider>
                  </LetterboxdProvider>
                </SimklProvider>
              </MalProvider>
            </AnilistProvider>
          </TraktProvider>
        </ParentalProvider>
      </ProfilesProvider>
    </SettingsProvider>
  );
}

function Shell({ onReady }: { onReady?: () => void }) {
  const {
    topKind,
    service,
    meta,
    metaLiveContext,
    metaEpisodeHint,
    episodeDetail,
    personId,
    collectionId,
    addonCollectionMeta,
    filter,
    brands,
    grid,
    awardType,
    curatedListId,
    picker,
    player,
    setView,
    openSettings,
    canGoBack,
    goBack,
    canGoForward,
    goForward,
    openMeta,
    openPerson,
    peopleInit,
    openPlayer,
    stackKinds,
    chromeHidden,
  } = useView();
  const { settings, update } = useSettings();
  const { open: searchOpen, setOpen: setSearchOpen } = useSearch();
  const bigPicture = useBigPicture().active;
  const bigPictureBootChecked = useRef(false);
  const uiScaleRef = useRef(settings.uiScale);
  const { activeProfile } = useProfiles();
  const kid = activeProfile?.kid ?? null;
  const preview = useThemePreview();
  useEffect(() => {
    void ensureCuratedLogos();
  }, []);
  useEffect(() => {
    void torrentEngineSetOptions(
      settings.streamCacheDir || null,
      settings.streamCacheRetentionHours,
      settings.streamCacheMaxGb,
      false,
    );
  }, [settings.streamCacheDir, settings.streamCacheRetentionHours, settings.streamCacheMaxGb]);
  const baseLayout = useMemo(
    () => (preview ? preview.layout : activeLayout(settings.theme)),
    [preview, settings.theme],
  );
  const layout = kid ? "sidebar" : baseLayout;
  const themeHasTopbar =
    layout === "sidebar" ||
    layout === "dracula" ||
    layout === "nord" ||
    layout === "forest" ||
    layout === "stremio";
  useViewPreloader(settings.tmdbKey);

  useEffect(() => {
    if (topKind === "home") return;
    onReady?.();
  }, [onReady, topKind]);

  const handleTvBack = useCallback(() => {
    if (canGoBack || topKind !== "home" || hasBackHandlers()) {
      goBack();
      return true;
    }
    return false;
  }, [goBack, canGoBack, topKind]);

  const handleTvBackToNav = useCallback(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const nav = getNavFocusTarget();
        if (nav) tvFocus(nav);
      }),
    );
  }, []);

  useEffect(() => {
    void releaseBigPictureFullscreen();
  }, []);

  useEffect(() => {
    // Autostart is a launch-only decision. Consume the check on the first run
    // whatever the outcome, so turning the setting on later does not drop the
    // user straight into Big Picture.
    const alreadyBooted = bigPictureBootChecked.current;
    bigPictureBootChecked.current = true;
    const go = shouldAutoStartBigPicture({
      autoStart: settings.bigPictureAutoStart,
      alreadyBooted,
      kidProfileActive: kid !== null,
    });
    if (!go) return;
    // Move Frame onto the chosen monitor before entering Big Picture, so the
    // fullscreen that follows binds to that display. Automatic skips the move
    // and leaves the window where the window-state plugin restored it.
    const display = settings.bigPictureDisplay;
    if (display.mode === "explicit") {
      void moveMainToMonitor(display.monitor).then(() => enterBigPicture());
      return;
    }
    enterBigPicture();
  }, [settings.bigPictureAutoStart, settings.bigPictureDisplay, kid]);

  useKeyboardNavigation({
    enabled: settings.tvNavigation && !player && !picker && !bigPicture,
    wrap: false,
    onBack: handleTvBack,
    onBackToNav: handleTvBackToNav,
  });

  useEffect(() => {
    if (!settings.tvNavigation || searchOpen || topKind === "player" || picker || bigPicture)
      return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && (!isVisible(active) || active === document.body)) {
      active.blur();
    }
    let frameId: number | null = null;
    let timerId: number | null = null;
    let attempts = 0;

    const tryFocus = () => {
      const current = document.activeElement;
      if (current instanceof HTMLElement && current !== document.body && isVisible(current)) {
        return;
      }
      focusTvPageDefault();
      const after = document.activeElement;
      if (
        (!after || after === document.body || !isVisible(after as HTMLElement)) &&
        attempts++ < 10
      ) {
        timerId = window.setTimeout(tryFocus, 100);
      }
    };

    frameId = window.requestAnimationFrame(tryFocus);
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [settings.tvNavigation, topKind, meta?.id, searchOpen, picker, bigPicture]);

  useEffect(() => {
    SFX.setTheme(settings.soundTheme);
    const volume = settings.sfxVolume ?? 50;
    SFX.setVolume(volume / 100);
  }, [settings.soundTheme, settings.sfxVolume]);

  useEffect(() => {
    if (settings.soundTheme === "none") return;
    const initAudio = () => SFX.init();
    window.addEventListener("pointerdown", initAudio, { once: true });
    window.addEventListener("keydown", initAudio, { once: true });

    const onMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const interactive = target.closest(
        'a[href], button, [data-focusable="true"], [role="button"]',
      ) as HTMLElement | null;

      if (!interactive) return;

      const related = e.relatedTarget as Node | null;
      if (related && interactive.contains(related)) return;

      SFX.hover();
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const btn = target.closest(
        'button, a[href], [data-focusable="true"], [role="button"]',
      ) as HTMLElement | null;

      if (!btn) return;

      const isCloseAction =
        (btn.getAttribute("aria-label") || "").toLowerCase().includes("back") ||
        btn.matches(
          "[data-harbor-back], [data-back], [data-close], [data-tv-modal-close], .close-btn, .back-btn",
        ) ||
        !!btn.closest(
          "[data-harbor-back], [data-back], [data-close], [data-tv-modal-close], .close-btn, .back-btn",
        );

      const isMovieCard =
        btn.hasAttribute("data-media-card") ||
        btn.hasAttribute("data-movie-card") ||
        btn.classList.contains("media-card") ||
        !!btn.querySelector("img") ||
        !!btn.closest("[data-tv-hero-zone]");

      const isMenuOrSettings = !!btn.closest(
        '.settings-panel, [role="menu"], [role="dialog"], [data-settings-root], [data-settings-panel]',
      );

      if (isCloseAction) {
        SFX.close();
        return;
      }

      if (isMovieCard || isMenuOrSettings) {
        SFX.open();
        return;
      }

      SFX.click();
    };
    window.addEventListener("mouseover", onMouseOver);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("pointerdown", initAudio);
      window.removeEventListener("keydown", initAudio);
      window.removeEventListener("mouseover", onMouseOver);
      window.removeEventListener("click", onClick, true);
    };
  }, [settings.soundTheme]);

  useEffect(() => {
    startWriteQueueFlusher();
    return startMaintenance();
  }, []);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 3) {
        const localBack = new Event("harbor:local-back", { cancelable: true });
        if (!window.dispatchEvent(localBack)) {
          e.preventDefault();
          return;
        }
        if (canGoBack || hasBackHandlers()) {
          e.preventDefault();
          goBack();
        }
      } else if (e.button === 4 && canGoForward) {
        e.preventDefault();
        goForward();
      }
    };
    window.addEventListener("mousedown", onMouseDown, true);
    return () => window.removeEventListener("mousedown", onMouseDown, true);
  }, [canGoBack, goBack, canGoForward, goForward]);

  useEffect(() => {
    uiScaleRef.current = settings.uiScale;
  }, [settings.uiScale]);

  useEffect(() => {
    const setUiScale = (next: number) => {
      const uiScale = clampUiScale(next);
      if (uiScale !== uiScaleRef.current) {
        uiScaleRef.current = uiScale;
        update({ uiScale });
      }
    };
    const stepUiScale = (direction: 1 | -1) => {
      setUiScale(uiScaleRef.current + direction * UI_SCALE_STEP);
    };
    const usesZoomModifier = (e: KeyboardEvent | WheelEvent) => e.ctrlKey || e.metaKey;
    const isDefaultUiScaleUp = (e: KeyboardEvent) =>
      usesZoomModifier(e) && (e.key === "+" || e.key === "=");
    const isDefaultUiScaleDown = (e: KeyboardEvent) =>
      usesZoomModifier(e) && (e.key === "-" || e.key === "_");
    const isDefaultUiScaleReset = (e: KeyboardEvent) => usesZoomModifier(e) && e.key === "0";
    const onKey = (e: KeyboardEvent) => {
      if (!shouldHandleGlobalKeyboardEvent(e)) return;
      const binding = eventToBinding(e);
      const overrides = settings.hotkeys ?? {};
      const globalMatch = findHotkeyMatch(e, overrides, "Global");
      if (
        globalMatch &&
        globalMatch !== "globalUiScaleUp" &&
        globalMatch !== "globalUiScaleDown" &&
        globalMatch !== "globalUiScaleReset"
      )
        return;
      const uiScaleUpCustom = "globalUiScaleUp" in overrides;
      const uiScaleDownCustom = "globalUiScaleDown" in overrides;
      const uiScaleResetCustom = "globalUiScaleReset" in overrides;
      const matchesUp =
        effectiveBinding("globalUiScaleUp", overrides) === binding ||
        (!uiScaleUpCustom && isDefaultUiScaleUp(e));
      const matchesDown =
        effectiveBinding("globalUiScaleDown", overrides) === binding ||
        (!uiScaleDownCustom && isDefaultUiScaleDown(e));
      const matchesReset =
        effectiveBinding("globalUiScaleReset", overrides) === binding ||
        (!uiScaleResetCustom && isDefaultUiScaleReset(e));
      if (!matchesUp && !matchesDown && !matchesReset) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      window.dispatchEvent(new Event(UI_SCALE_ACTIVITY_EVENT));
      if (matchesReset) {
        setUiScale(1);
      } else if (matchesUp) {
        stepUiScale(1);
      } else if (matchesDown) {
        stepUiScale(-1);
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (!usesZoomModifier(e)) return;
      e.preventDefault();
      e.stopPropagation();
      window.dispatchEvent(new Event(UI_SCALE_ACTIVITY_EVENT));
      stepUiScale(e.deltaY < 0 ? 1 : -1);
    };
    let wheelBound = false;
    const bindWheel = () => {
      if (wheelBound) return;
      wheelBound = true;
      window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    };
    const unbindWheel = () => {
      if (!wheelBound) return;
      wheelBound = false;
      window.removeEventListener("wheel", onWheel, true);
    };
    const onModKey = (e: KeyboardEvent) => {
      if (usesZoomModifier(e)) bindWheel();
      else unbindWheel();
    };
    const onPinchWheel = (e: WheelEvent) => {
      if (wheelBound || !usesZoomModifier(e)) return;
      window.dispatchEvent(new Event(UI_SCALE_ACTIVITY_EVENT));
      stepUiScale(e.deltaY < 0 ? 1 : -1);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keydown", onModKey, true);
    window.addEventListener("keyup", onModKey, true);
    window.addEventListener("blur", unbindWheel);
    window.addEventListener("wheel", onPinchWheel, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keydown", onModKey, true);
      window.removeEventListener("keyup", onModKey, true);
      window.removeEventListener("blur", unbindWheel);
      window.removeEventListener("wheel", onPinchWheel);
      unbindWheel();
    };
  }, [settings.hotkeys, update]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!shouldHandleGlobalKeyboardEvent(e)) return;
      if (findHotkeyMatch(e, settings.hotkeys ?? {}, "Global") !== "globalSettingsOpen") return;
      e.preventDefault();
      if (player || document.querySelector('[data-harbor-multiview-active="true"]')) return;
      e.stopPropagation();
      if (e.repeat) return;
      openSettings();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [openSettings, player, settings.hotkeys]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!shouldHandleGlobalKeyboardEvent(e)) return;
      if (e.repeat) return;
      if (findHotkeyMatch(e, settings.hotkeys ?? {}, "Global") === "globalWindowFullscreen") {
        e.preventDefault();
        void toggleWindowFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings.hotkeys]);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    void reconcilePendingTorrentRemovals();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen("harbor://app-closing", async () => {
        await Promise.all([
          flushCloudSync().catch(() => {}),
          flushPendingTorrentRemovals().catch(() => {}),
        ]);
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("harbor_flush_done").catch(() => {});
      }).then((rawUnlisten) => {
        const u = makeSafeTauriUnlisten(rawUnlisten);
        if (cancelled) u();
        else unlisten = u;
      }),
    );
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const w = window as unknown as { harbor?: Record<string, unknown> };
    w.harbor = {
      ...w.harbor,
      navigate: (v: string) => setView(v as View),
      back: () => goBack(),
      search: () => setSearchOpen(true),
      openSettings: () => setView("settings"),
      // Profiles, notifications and the account menu needed Frame accounts. The
      // hooks stay as no-ops so custom theme code that calls them keeps running.
      openNotifications: () => {},
      openAccountMenu: () => {},
      bigPicture: () => {
        const offer = shouldOfferBigPicture({
          kidProfileActive: kid !== null,
          buttonEnabled: settings.bigPictureButton,
          suppressedByChrome: false,
        });
        if (offer) enterBigPicture();
      },
      tryViewMyProfile: () => false,
      viewMyProfile: async () => {},
      unreadCount: () => 0,
      onUnread: () => () => {},
    };
  }, [setView, goBack, setSearchOpen, kid, settings.bigPictureButton]);

  useEffect(() => {
    void import("@/lib/addon-store").then(({ seedDefaultAddonsIfFirstRun }) =>
      seedDefaultAddonsIfFirstRun(),
    );
  }, []);

  useEffect(() => {
    let dispose: (() => void) | null = null;
    void import("@/lib/deep-link").then(
      ({
        startDeepLinkBridge,
        onDeepLinkInstall,
        onDeepLinkOpen,
        onOpenLocalFile,
        isProfileEditUrl,
      }) => {
        void startDeepLinkBridge().then((stopBridge) => {
          const stopListener = onDeepLinkInstall((rawUrl) => {
            if (window.__harborInstallerOpen) return;
            if (isProfileEditUrl(rawUrl)) return;
            setView("addons");
          });
          const stopOpen = onDeepLinkOpen(({ type, id, videoId }) => {
            if (type === "person") {
              const personId = Number(id);
              if (Number.isInteger(personId) && personId > 0) openPerson(personId);
              return;
            }
            if (type === "manga" || type === "ebook") return;
            const hint = parseDeepLinkEpisode(videoId);
            openMeta(
              { id, type: type as MetaType, name: "" },
              hint ? { episodeHint: hint } : undefined,
            );
          });
          const stopFile = onOpenLocalFile((path) => {
            const name = (path.replace(/\\/g, "/").split("/").pop() || "Video").replace(
              /\.[^.]+$/,
              "",
            );
            openPlayer({
              meta: { id: `local:${path}`, type: "movie", name },
              url: path,
              title: name,
              notWebReady: true,
            });
          });
          dispose = () => {
            stopBridge();
            stopListener();
            stopOpen();
            stopFile();
          };
        });
      },
    );
    return () => {
      dispose?.();
    };
  }, [setView, openMeta, openPlayer, openPerson]);

  useEffect(() => {
    if (REMOVED_PAGES.has(topKind)) setView("home");
  }, [topKind, setView]);

  const playerActive = !!player && !player.sportsDocked && !player.pipDocked;
  useEffect(() => setNativeMemoryActive(playerActive), [playerActive]);
  useEffect(() => {
    if (!playerActive) void exitWindowFullscreenOnPlayerClose();
  }, [playerActive]);
  const pickerTop = topKind === "picker";
  const personTop = topKind === "person";
  const collectionTop = topKind === "collection";
  const addonCollectionTop = topKind === "addon-collection";
  const episodeDetailTop = topKind === "episode-detail";
  const collectionsIndexTop = topKind === "collections";
  const collectionsIndexAlive = useKeepAlive(
    collectionsIndexTop,
    true,
    stackKinds.includes("collections"),
  );
  const detailTop = topKind === "meta";
  const filterTop = topKind === "filter";
  const brandsTop = topKind === "brands";
  const gridTop = topKind === "grid";
  const awardTop = topKind === "award";
  const curatedListTop = topKind === "curated-list";
  const settingsTop = topKind === "settings";
  const discoverTop = topKind === "discover";
  const catalogsTop = topKind === "catalogs";
  const addonsTop = topKind === "addons" || topKind === "addon-detail";
  const wrappedTop = topKind === "wrapped";
  const queueTop = topKind === "queue";
  const serviceTop = topKind === "service";
  const homeTop = topKind === "home";
  const moviesTop = topKind === "movies";
  const showsTop = topKind === "shows";
  const libraryTop = topKind === "library";
  const collectionsHubTop = topKind === "collections-hub";
  const pluginCatalogues = usePluginCataloguesAvailable();
  const pluginsTop = topKind === "plugins" && pluginCatalogues;
  useEffect(() => {
    if (!pluginCatalogues && topKind === "plugins") setView("home");
  }, [pluginCatalogues, topKind, setView]);
  const downloadsTop = topKind === "downloads";
  const peopleTop = topKind === "people";
  const radarTop = topKind === "radar";
  const followingTop = topKind === "following";

  const [immersive, setImmersive] = useState(false);
  useEffect(() => {
    const onImm = (e: Event) => setImmersive((e as CustomEvent<boolean>).detail === true);
    window.addEventListener("harbor:immersive", onImm);
    return () => window.removeEventListener("harbor:immersive", onImm);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (playerActive || pickerTop || immersive || settingsTop || chromeHidden)
      root.dataset.chromeHidden = "true";
    else delete root.dataset.chromeHidden;
  }, [playerActive, pickerTop, immersive, settingsTop, chromeHidden]);

  useEffect(() => {
    document.querySelectorAll("[data-harbor-nav]").forEach((el) => {
      el.toggleAttribute("data-active", el.getAttribute("data-harbor-nav") === topKind);
    });
  }, [topKind]);

  const layer = (top: boolean) => (top ? "contents harbor-layer-active" : "hidden");
  const parkLayer = (top: boolean) =>
    top
      ? "harbor-layer-active flex min-h-0 min-w-0 flex-1 flex-col"
      : "flex min-h-0 min-w-0 flex-1 flex-col absolute inset-0 invisible pointer-events-none [content-visibility:hidden]";

  const layerProps = (top: boolean) => ({
    className: layer(top),
    inert: !top,
    "data-layer-inactive": !top ? "" : undefined,
  });

  const parkLayerProps = (top: boolean) => ({
    className: parkLayer(top),
    inert: !top,
    "data-layer-inactive": !top ? "" : undefined,
  });

  useEffect(() => startMediaSessionWindowTracking(), []);

  const overlayPinned = useOverlayPinned();
  const settingsAlive = useIdleEvict(settingsTop, overlayPinned);
  const discoverAlive = useIdleEvict(discoverTop);
  const catalogsAlive = useIdleEvict(catalogsTop);
  const pluginsAlive = useIdleEvict(pluginsTop);
  const addonsAlive = useIdleEvict(addonsTop);
  const wrappedAlive = useIdleEvict(wrappedTop);
  const queueAlive = useKeepAlive(queueTop, queueTop);
  const serviceAlive = useKeepAlive(serviceTop, serviceTop && !!service);
  const detailAlive = useKeepAlive(detailTop, !!meta);
  const personAlive = useKeepAlive(personTop, personId !== null);
  const addonCollectionAlive = useKeepAlive(
    addonCollectionTop,
    !!addonCollectionMeta,
    stackKinds.includes("addon-collection"),
  );
  const collectionAlive = useKeepAlive(
    collectionTop,
    collectionId !== null,
    stackKinds.includes("collection"),
  );
  const episodeDetailAlive = useKeepAlive(
    episodeDetailTop,
    !!episodeDetail,
    stackKinds.includes("episode-detail"),
  );
  const filterAlive = useKeepAlive(filterTop, !!filter);
  const brandsAlive = useKeepAlive(brandsTop, !!brands);
  const gridAlive = useKeepAlive(gridTop, !!grid, stackKinds.includes("grid"));
  const awardAlive = useKeepAlive(awardTop, awardTop);
  const curatedListAlive = useKeepAlive(curatedListTop, curatedListTop && !!curatedListId);
  const pickerAlive = useKeepAlive(pickerTop, !!picker);
  const moviesAlive = useIdleEvict(moviesTop);
  const showsAlive = useIdleEvict(showsTop);
  const libraryAlive = useIdleEvict(libraryTop);
  const collectionsHubAlive = useIdleEvict(collectionsHubTop);
  const downloadsAlive = useIdleEvict(downloadsTop);
  const peopleAlive = useIdleEvict(peopleTop);
  const radarAlive = useIdleEvict(radarTop);
  const followingAlive = useIdleEvict(followingTop);
  return (
    <div data-harbor-shell className="relative flex h-full">
      <div data-harbor-native-backdrop className="relative flex h-full min-w-0 flex-1">
        {!settingsTop && !playerActive && !pickerTop && layout === "sidebar" && <Sidebar />}
        {!settingsTop && !playerActive && !pickerTop && layout === "dracula" && <DraculaSidebar />}
        {!settingsTop && !playerActive && !pickerTop && layout === "nord" && <NordSidebar />}
        {!settingsTop && !playerActive && !pickerTop && layout === "forest" && <ForestSidebar />}
        {!settingsTop && !playerActive && !pickerTop && layout === "stremio" && <StremioRail />}
        {!settingsTop && !playerActive && !pickerTop && layout === "topdock" && !immersive && (
          <TopDock />
        )}
        {!settingsTop && !playerActive && !pickerTop && layout === "cinematic" && !immersive && (
          <CinematicOverlay />
        )}
        {!settingsTop && !playerActive && !pickerTop && layout === "royal" && !immersive && (
          <RoyalTopbar />
        )}
        {!settingsTop && !playerActive && !pickerTop && layout === "rail" && !immersive && (
          <SideRail />
        )}
        {!playerActive && !pickerTop && layout === "minui" && !immersive && <MinUIDock />}
        {!playerActive && !pickerTop && layout === "topdock" && !immersive && (
          <div className="contents">
            <FloatingBack offsetTop={92} />
          </div>
        )}
        {!playerActive && !pickerTop && layout === "cinematic" && !immersive && (
          <div className="contents">
            <FloatingBack offsetTop={92} />
          </div>
        )}
        {!playerActive && !pickerTop && layout === "royal" && !immersive && (
          <div className="contents">
            <FloatingBack offsetTop={92} />
          </div>
        )}
        {!playerActive && !pickerTop && layout === "rail" && !immersive && (
          <div className="contents">
            <FloatingBack offsetLeft={settings.sidebarCollapsed ? 88 : 220} offsetTop={28} />
          </div>
        )}
        {!playerActive && !pickerTop && layout === "custom" && !immersive && (
          <div className="contents">
            <FloatingBack offsetLeft={20} offsetTop={20} />
          </div>
        )}
        {!playerActive && !pickerTop && layout === "custom" && !immersive && (
          <div className="fixed end-3 top-3 z-[120]">
            <WindowControls />
          </div>
        )}
        {!playerActive && <WindowResizeEdges />}
        <HybridTitleBar suppressed={playerActive || immersive || chromeHidden} />
        <div
          className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${playerActive ? "invisible" : ""}`}
        >
          <div {...parkLayerProps(homeTop)}>
            <SpooktoberHome active={homeTop} onReady={onReady} />
          </div>
          {settingsAlive && (
            <div {...layerProps(settingsTop)}>
              <Suspense fallback={null}>
                <Settings visible={settingsTop} />
              </Suspense>
            </div>
          )}
          {discoverAlive && (
            <div {...parkLayerProps(discoverTop)}>
              <Suspense fallback={null}>
                <Discover active={discoverTop} />
              </Suspense>
            </div>
          )}
          {catalogsAlive && (
            <div {...layerProps(catalogsTop)}>
              <Suspense fallback={null}>
                <Catalogs active={catalogsTop} />
              </Suspense>
            </div>
          )}
          {pluginsAlive && (
            <div {...layerProps(pluginsTop)}>
              <Suspense fallback={null}>
                <PluginsView active={pluginsTop} />
              </Suspense>
            </div>
          )}
          {addonsAlive && (
            <div {...layerProps(addonsTop)}>
              <Suspense fallback={null}>
                <AddonsView active={addonsTop} />
              </Suspense>
            </div>
          )}
          {wrappedAlive && (
            <div {...layerProps(wrappedTop)}>
              <Suspense fallback={null}>
                <WrappedView active={wrappedTop} />
              </Suspense>
            </div>
          )}
          {moviesAlive && (
            <div {...layerProps(moviesTop)}>
              <Suspense fallback={null}>
                <Movies active={moviesTop} />
              </Suspense>
            </div>
          )}
          {showsAlive && (
            <div {...layerProps(showsTop)}>
              <Suspense fallback={null}>
                <Shows active={showsTop} />
              </Suspense>
            </div>
          )}
          {libraryAlive && (
            <div {...layerProps(libraryTop)}>
              <Suspense fallback={null}>
                <LibraryView active={libraryTop} />
              </Suspense>
            </div>
          )}
          {collectionsHubAlive && (
            <div {...layerProps(collectionsHubTop)}>
              <Suspense fallback={null}>
                <CommunityCollectionsView active={collectionsHubTop} />
              </Suspense>
            </div>
          )}
          {downloadsAlive && (
            <div {...layerProps(downloadsTop)}>
              <Suspense fallback={null}>
                <DownloadsView active={downloadsTop} />
              </Suspense>
            </div>
          )}
          {peopleAlive && (
            <div {...layerProps(peopleTop)}>
              <Suspense fallback={null}>
                <PeopleView init={peopleInit} />
              </Suspense>
            </div>
          )}
          {radarAlive && (
            <div {...layerProps(radarTop)}>
              <Suspense fallback={null}>
                <RadarView active={radarTop} />
              </Suspense>
            </div>
          )}
          {followingAlive && (
            <div {...layerProps(followingTop)}>
              <Suspense fallback={null}>
                <FollowingView active={followingTop} />
              </Suspense>
            </div>
          )}
          {queueAlive && (
            <div {...layerProps(queueTop)}>
              <Suspense fallback={null}>
                <QueueView />
              </Suspense>
            </div>
          )}
          {serviceAlive && service && (
            <div {...layerProps(serviceTop)}>
              <Suspense fallback={null}>
                <ServiceView key={service} service={service} />
              </Suspense>
            </div>
          )}
          {detailAlive && meta && (
            <div {...layerProps(detailTop)}>
              <Suspense fallback={null}>
                <DetailView
                  key={`meta-${meta.id}`}
                  meta={meta}
                  liveContext={metaLiveContext}
                  episodeHint={metaEpisodeHint ?? undefined}
                />
              </Suspense>
            </div>
          )}
          {personAlive && personId !== null && (
            <div {...layerProps(personTop)}>
              <Suspense fallback={null}>
                <PersonView key={`person-${personId}`} personId={personId} />
              </Suspense>
            </div>
          )}
          {collectionAlive && collectionId !== null && (
            <div {...layerProps(collectionTop)}>
              <Suspense fallback={null}>
                <CollectionView key={`collection-${collectionId}`} collectionId={collectionId} />
              </Suspense>
            </div>
          )}
          {addonCollectionAlive && addonCollectionMeta && (
            <div {...layerProps(addonCollectionTop)}>
              <Suspense fallback={null}>
                <AddonCollectionView
                  key={`addon-collection-${addonCollectionMeta.id}`}
                  meta={addonCollectionMeta}
                />
              </Suspense>
            </div>
          )}
          {episodeDetailAlive && episodeDetail && (
            <div {...layerProps(episodeDetailTop)}>
              <Suspense fallback={null}>
                <EpisodeDetailView
                  key={`episode-${episodeDetail.seriesId}-${episodeDetail.season}-${episodeDetail.episode}`}
                  seriesId={episodeDetail.seriesId}
                  season={episodeDetail.season}
                  episode={episodeDetail.episode}
                  seriesMeta={episodeDetail.seriesMeta}
                  playback={episodeDetail.playback}
                />
              </Suspense>
            </div>
          )}
          {filterAlive && filter && (
            <div {...layerProps(filterTop)}>
              <Suspense fallback={null}>
                <FilterView key={filterReactKey(filter)} filter={filter} />
              </Suspense>
            </div>
          )}
          {brandsAlive && brands && (
            <div className={layer(brandsTop)}>
              <Suspense fallback={null}>
                <BrandsView key={`brands-${brands}`} brand={brands} />
              </Suspense>
            </div>
          )}
          {gridAlive && grid && (
            <div {...layerProps(gridTop)}>
              <Suspense fallback={null}>
                <GridView key={`grid-${grid.title}`} grid={grid} />
              </Suspense>
            </div>
          )}
          {collectionsIndexAlive && (
            <div {...layerProps(collectionsIndexTop)}>
              <Suspense fallback={null}>
                <CollectionsView />
              </Suspense>
            </div>
          )}
          {awardAlive && awardType && (
            <div {...layerProps(awardTop)}>
              <Suspense fallback={null}>
                <AwardView key={`award-${awardType}`} awardType={awardType} />
              </Suspense>
            </div>
          )}
          {curatedListAlive && curatedListId && (
            <div {...layerProps(curatedListTop)}>
              <Suspense fallback={null}>
                <CuratedListView key={`curated-list-${curatedListId}`} listId={curatedListId} />
              </Suspense>
            </div>
          )}
          {pickerAlive && picker && (
            <div {...layerProps(pickerTop)}>
              <Suspense fallback={null}>
                <PlayPicker
                  key={`picker-${picker.meta.id}-${picker.episode?.season ?? ""}-${picker.episode?.episode ?? ""}-${picker.attempt ?? 0}-${picker.intent ?? "play"}-${picker.seasonEpisodes?.length ?? 0}`}
                  meta={picker.meta}
                  episode={picker.episode}
                  autoPlay={picker.intent === "download" ? false : picker.autoPlay}
                  attempt={picker.attempt}
                  intent={picker.intent}
                  seasonEpisodes={picker.seasonEpisodes}
                  resume={picker.resume}
                  playerActive={playerActive}
                />
              </Suspense>
            </div>
          )}
          {pickerTop && !themeHasTopbar && (
            <div className="fixed end-3 top-3 z-[120]">
              <WindowControls />
            </div>
          )}
          {!immersive && !settingsTop && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 z-30 h-24 bg-gradient-to-b from-canvas/85 via-canvas/40 to-transparent"
            />
          )}
          {!immersive &&
            (themeHasTopbar || (settingsTop && layout !== "minui" && layout !== "custom")) && (
              <Topbar />
            )}
          {!immersive && !playerActive && !pickerTop && layout === "custom" && (
            <div aria-hidden className="harbor-chrome-proxy fixed end-3 top-3 z-[40]">
              <TogetherButton />
            </div>
          )}
          {!immersive && !playerActive && !pickerTop && !bigPicture && layout === "custom" && (
            <div className="harbor-bp-proxy">
              <BigPictureEntryButton hidden={chromeHidden} />
            </div>
          )}
          {!immersive && layout === "rail" && !settingsTop && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-canvas/90 via-canvas/40 to-transparent"
            />
          )}
        </div>
      </div>
      {player && (
        <Suspense fallback={null}>
          <PlayerView
            key={player.meta.id.startsWith("iptv:") ? "player-live" : `player-${player.meta.id}`}
            src={player}
          />
        </Suspense>
      )}
      {bigPicture && (
        <BpErrorBoundary>
          <Suspense fallback={null}>
            <BigPictureShell />
          </Suspense>
        </BpErrorBoundary>
      )}
      <CustomCodeMount />
      <ThemeChromeBridge />
      <MemoryHud />
      <TabHotkeys />
      {!player && <OfflineBanner />}
    </div>
  );
}

export type { Frame };
