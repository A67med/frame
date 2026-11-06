import { useSyncExternalStore } from "react";
import type { SubtitleLoadMetadata } from "./types";

/**
 * A subtitle a translating addon accepted but has not produced yet. Frame keeps
 * re-checking the same URL and, once the finished file is served, adds it automatically.
 */
export type TranslationJob = {
  url: string;
  lang?: string;
  title?: string;
  metadata?: SubtitleLoadMetadata;
  startedAt: number;
};

/** Give up on a translation that never arrives. */
export const TRANSLATION_JOB_MAX_MS = 10 * 60 * 1000;

let jobs: TranslationJob[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Begins tracking a pending translation. Idempotent per URL, keeping the first start time. */
export function registerTranslationJob(job: Omit<TranslationJob, "startedAt">): void {
  if (!job.url || jobs.some((existing) => existing.url === job.url)) return;
  jobs = [...jobs, { ...job, startedAt: Date.now() }];
  emit();
}

export function completeTranslationJob(url: string): void {
  if (!jobs.some((existing) => existing.url === url)) return;
  jobs = jobs.filter((existing) => existing.url !== url);
  emit();
}

/** Drop every pending job (e.g. the media changed and they no longer apply). */
export function clearTranslationJobs(): void {
  if (jobs.length === 0) return;
  jobs = [];
  emit();
}

export function expiredTranslationJobs(now = Date.now()): TranslationJob[] {
  return jobs.filter((job) => now - job.startedAt >= TRANSLATION_JOB_MAX_MS);
}

export function useTranslationJobs(): TranslationJob[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => jobs,
    () => jobs,
  );
}

/** True while a translation for this exact URL is still pending. */
export function useTranslationJob(url: string): boolean {
  const list = useTranslationJobs();
  return list.some((job) => job.url === url);
}

export type SubtitleTranslationStatus = "pending" | "failed";

/** How often a translation the addon has not finished is asked for again. */
export const TRANSLATION_POLL_MS = 30_000;

let statuses = new Map<string, SubtitleTranslationStatus>();
const statusListeners = new Set<() => void>();

/** Replaces every published status; an empty list clears them (new media, closed player). */
export function publishSubtitleTranslations(
  entries: readonly (readonly [string, SubtitleTranslationStatus])[],
): void {
  statuses = new Map(entries);
  for (const listener of statusListeners) listener();
}

function setStatus(url: string, status: SubtitleTranslationStatus | null): void {
  if ((statuses.get(url) ?? null) === status) return;
  const next = new Map(statuses);
  if (status) next.set(url, status);
  else next.delete(url);
  publishSubtitleTranslations([...next]);
}

export function subtitleTranslationStatus(url: string): SubtitleTranslationStatus | null {
  return statuses.get(url) ?? null;
}

export function useSubtitleTranslationStatus(url: string): SubtitleTranslationStatus | null {
  return useSyncExternalStore(
    (cb) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    () => subtitleTranslationStatus(url),
    () => subtitleTranslationStatus(url),
  );
}

const isPending = (error: unknown) =>
  error instanceof Error && "reason" in error && error.reason === "translation-pending";

// One poll per URL with never two requests in flight; `attempt` is true once the file is added, `owns` false once moot.
export function createSubtitleTranslationQueue() {
  type Job = { timer: ReturnType<typeof setTimeout> | null };
  const jobs = new Map<string, Job>();

  const stop = (url: string) => {
    const job = jobs.get(url);
    if (job?.timer) clearTimeout(job.timer);
    jobs.delete(url);
  };

  async function run(
    url: string,
    owns: () => boolean,
    attempt: () => Promise<boolean>,
  ): Promise<boolean> {
    stop(url);
    const job: Job = { timer: null };
    jobs.set(url, job);
    const startedAt = Date.now();
    const current = () => jobs.get(url) === job && owns();
    const finish = (status: SubtitleTranslationStatus | null) => {
      if (jobs.get(url) === job) jobs.delete(url);
      setStatus(url, status);
    };
    const later = (delay: number, next: () => void) => {
      job.timer = setTimeout(() => {
        job.timer = null;
        if (current()) next();
        else if (jobs.get(url) === job) finish(null);
      }, delay);
    };
    const poll = async (): Promise<boolean> => {
      const sentAt = Date.now();
      try {
        const done = await attempt();
        if (!current()) return false;
        finish(done ? null : "failed");
        return done;
      } catch (error) {
        if (!current()) return false;
        const remaining = TRANSLATION_JOB_MAX_MS - (Date.now() - startedAt);
        if (!isPending(error) || remaining <= 0) {
          finish("failed");
          return false;
        }
        setStatus(url, "pending");
        // An addon that held a request past the poll interval is still busy; asking again only stacks more work on it.
        if (Date.now() - sentAt >= TRANSLATION_POLL_MS) later(remaining, () => finish("failed"));
        else later(Math.min(TRANSLATION_POLL_MS, remaining), () => void poll());
        return false;
      }
    };
    return poll();
  }

  return {
    run,
    cancel(url: string) {
      if (!jobs.has(url)) return;
      stop(url);
      setStatus(url, null);
    },
    clear() {
      const urls = [...jobs.keys()];
      for (const url of urls) stop(url);
      for (const url of urls) setStatus(url, null);
    },
  };
}
