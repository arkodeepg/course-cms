// Command palette model: payload shape, item building, search and actions.
// Client safe (no fs, no Prisma). The server half lives in lib/palette-index.ts.

import { normalize, rank, type Field } from "@/lib/fuzzy";
import { isViewable } from "@/lib/resource-kinds";

// ---------------------------------------------------------------------------
// Payload served by /api/palette. Indexed tuples keep it small.

export type CourseRow = [id: string, title: string, hasResources: 0 | 1, dir: string];
export type ModuleRow = [courseIdx: number, moduleIndex: number, name: string];
export type LessonRow = [courseIdx: number, moduleIndex: number, lessonIndex: number, title: string];
// moduleIndex 0 means a course-level download.
export type ResourceRow = [courseIdx: number, moduleIndex: number, name: string, path: string, viewable: 0 | 1];
export type RecentRow = [courseIdx: number, moduleIndex: number, lessonIndex: number];

export interface PaletteIndex {
  v: 1;
  root: string; // COURSES_PATH, to build download hrefs
  courses: CourseRow[];
  modules: ModuleRow[];
  lessons: LessonRow[];
  resources: ResourceRow[];
  recent: RecentRow[];
}

// Same viewable kinds as the resources page viewer (lib/resource-kinds.ts).
export function isViewableExt(ext: string): boolean {
  return isViewable(ext.toLowerCase());
}

// ---------------------------------------------------------------------------
// Commands. The player listens for `cms:command` with these ids. A shared
// `lib/commands.ts` (PLAYER_COMMANDS) replaces this list after merge: swap the
// import in LESSON_ACTIONS and nothing else changes.

export const PLAYER_COMMAND_EVENT = "cms:command";
export const LIBRARY_VIEW_EVENT = "cms:library-view";
export const PALETTE_OPEN_EVENT = "cms:palette-open";
export const LIBRARY_VIEW_STORAGE_KEY = "coursevault-view";

export const PLAYER_COMMAND_IDS = [
  "play-toggle",
  "next",
  "prev",
  "mark-complete",
  "copy-timestamp",
  "speed:0.75",
  "speed:1",
  "speed:1.25",
  "speed:1.5",
  "speed:1.75",
  "speed:2",
  "speed:2.5",
  "speed:3",
  "fullscreen",
  "pip",
  "seek:+10",
  "seek:-10",
] as const;

export type PlayerCommandId = (typeof PLAYER_COMMAND_IDS)[number];

export function dispatchPlayerCommand(id: PlayerCommandId): void {
  window.dispatchEvent(new CustomEvent(PLAYER_COMMAND_EVENT, { detail: { id } }));
}

export function openCommandPalette(): void {
  window.dispatchEvent(new CustomEvent(PALETTE_OPEN_EVENT));
}

interface ActionDef {
  id: string;
  label: string;
  keywords: string;
  hint?: string;
}

function playerLabel(id: PlayerCommandId): ActionDef {
  if (id.startsWith("speed:")) {
    const v = id.slice(6);
    return { id, label: `Playback speed ${v}x`, keywords: `rate speed ${v} ${v}x faster slower` };
  }
  switch (id) {
    case "play-toggle":
      return { id, label: "Play / pause", keywords: "play pause toggle resume stop", hint: "K" };
    case "next":
      return { id, label: "Next lesson", keywords: "forward skip lesson", hint: "N" };
    case "prev":
      return { id, label: "Previous lesson", keywords: "back lesson previous", hint: "P" };
    case "mark-complete":
      return { id, label: "Mark lesson complete", keywords: "done finished complete watched" };
    case "copy-timestamp":
      return { id, label: "Copy link at current time", keywords: "timestamp share link copy url" };
    case "fullscreen":
      return { id, label: "Toggle fullscreen", keywords: "full screen maximise maximize", hint: "F" };
    case "pip":
      return { id, label: "Picture in picture", keywords: "pip float mini player popout" };
    case "seek:+10":
      return { id, label: "Skip forward 10 s", keywords: "seek forward ahead jump 10 seconds", hint: "L" };
    case "seek:-10":
      return { id, label: "Skip back 10 s", keywords: "seek rewind back jump 10 seconds", hint: "J" };
  }
  return { id, label: id, keywords: "" };
}

export const LESSON_ACTIONS: ActionDef[] = PLAYER_COMMAND_IDS.map(playerLabel);

export const GLOBAL_ACTIONS: ActionDef[] = [
  { id: "resume", label: "Resume last lesson", keywords: "continue watching last recent" },
  { id: "toggle-view", label: "Toggle grid / list view", keywords: "library layout cards list grid view" },
  { id: "shortcuts", label: "Keyboard shortcuts", keywords: "help keys hotkeys player shortcuts" },
];

export const PLAYER_SHORTCUTS: Array<[keys: string, what: string]> = [
  ["Space / K", "Play or pause"],
  ["Left / Right", "Back or forward 5 s"],
  ["J / L", "Back or forward 10 s"],
  ["Up / Down", "Volume up or down"],
  ["M", "Mute"],
  ["F", "Fullscreen"],
  ["< / >", "Slower or faster"],
  ["N / P", "Next or previous lesson"],
  ["0 to 9", "Jump to 0% to 90%"],
  ["Ctrl/Cmd + K", "Open this palette"],
];

// ---------------------------------------------------------------------------
// Items

export type ItemKind = "course" | "lesson" | "resource" | "page" | "action" | "search";

export interface PaletteItem {
  key: string; // stable id for Recent
  kind: ItemKind;
  title: string;
  subtitle?: string;
  href?: string;
  download?: boolean; // href is a file download, not a page
  action?: string; // action id
  hint?: string;
  fields: Field[];
}

export interface PreparedIndex {
  raw: PaletteIndex;
  courses: PaletteItem[];
  lessons: PaletteItem[];
  resources: PaletteItem[];
  pages: PaletteItem[];
  byKey: Map<string, PaletteItem>;
  recent: PaletteItem[];
}

function f(text: string, weight: number): Field {
  return { text: normalize(text), weight };
}

export function lessonHref(courseId: string, m: number, l: number): string {
  return `/course/${courseId}/${m}/${l}`;
}

export function resourceViewHref(courseId: string, path: string): string {
  return `/course/${courseId}/resources?view=${encodeURIComponent(path)}`;
}

export function resourceDownloadHref(root: string, dir: string, path: string): string {
  const abs = [root.replace(/\/+$/, ""), dir, path].join("/").replace(/\/+/g, "/");
  return "/api/resource" + abs.split("/").map((s) => encodeURIComponent(s)).join("/") + "?download=1";
}

export function prepareIndex(raw: PaletteIndex): PreparedIndex {
  const moduleName = new Map<string, string>();
  for (const [ci, m, name] of raw.modules) moduleName.set(`${ci}:${m}`, name);

  const courses: PaletteItem[] = raw.courses.map(([id, title]) => ({
    key: `c:${id}`,
    kind: "course",
    title,
    subtitle: "Course",
    href: `/course/${id}`,
    fields: [f(title, 1), f(id.replace(/-/g, " "), 0.8)],
  }));

  const lessons: PaletteItem[] = raw.lessons.map(([ci, m, l, title]) => {
    const [id, courseTitle] = raw.courses[ci];
    const mod = moduleName.get(`${ci}:${m}`) ?? "";
    return {
      key: `l:${id}:${m}:${l}`,
      kind: "lesson",
      title,
      subtitle: mod ? `${courseTitle} · ${mod}` : courseTitle,
      href: lessonHref(id, m, l),
      fields: [f(title, 1), f(courseTitle, 0.6), f(mod, 0.5)],
    };
  });

  const resources: PaletteItem[] = raw.resources.map(([ci, m, name, path, viewable]) => {
    const [id, courseTitle, , dir] = raw.courses[ci];
    const group = m === 0 ? "Course downloads" : moduleName.get(`${ci}:${m}`) ?? "";
    return {
      key: `r:${id}:${path}`,
      kind: "resource",
      title: name,
      subtitle: group ? `${courseTitle} · ${group}` : courseTitle,
      href: viewable ? resourceViewHref(id, path) : resourceDownloadHref(raw.root, dir, path),
      download: !viewable,
      hint: viewable ? undefined : "Download",
      fields: [f(name, 1), f(courseTitle, 0.6), f(group, 0.4)],
    };
  });

  const pages: PaletteItem[] = [
    {
      key: "p:/",
      kind: "page",
      title: "Library",
      subtitle: "All courses",
      href: "/",
      fields: [f("Library", 1), f("home all courses", 0.7)],
    },
    {
      key: "p:/search",
      kind: "page",
      title: "Search",
      subtitle: "Full lesson search",
      href: "/search",
      fields: [f("Search", 1), f("find lessons full text", 0.7)],
    },
  ];
  raw.courses.forEach(([id, title, hasResources], ci) => {
    pages.push({
      key: `p:/course/${id}`,
      kind: "page",
      title: `${title}`,
      subtitle: "Course overview",
      href: `/course/${id}`,
      fields: [f(title, 1), f("overview course", 0.7)],
    });
    for (const [mci, m, name] of raw.modules) {
      if (mci !== ci) continue;
      pages.push({
        key: `p:/course/${id}/${m}`,
        kind: "page",
        title: name,
        subtitle: `${title} · Module ${m}`,
        href: `/course/${id}/${m}`,
        fields: [f(name, 1), f(title, 0.5), f(`module ${m}`, 0.5)],
      });
    }
    if (hasResources) {
      pages.push({
        key: `p:/course/${id}/resources`,
        kind: "page",
        title: `Resources · ${title}`,
        subtitle: "Downloads and handouts",
        href: `/course/${id}/resources`,
        fields: [f("Resources", 1), f(title, 0.6), f("downloads handouts files pdf", 0.6)],
      });
    }
  });

  const byKey = new Map<string, PaletteItem>();
  for (const list of [courses, lessons, resources, pages]) for (const it of list) byKey.set(it.key, it);

  const recent: PaletteItem[] = [];
  for (const [ci, m, l] of raw.recent) {
    const c = raw.courses[ci];
    if (!c) continue;
    const it = byKey.get(`l:${c[0]}:${m}:${l}`);
    if (it) recent.push(it);
  }

  return { raw, courses, lessons, resources, pages, byKey, recent };
}

export interface PaletteContext {
  pathname: string;
  recentKeys?: string[]; // localStorage picks, newest first
}

export function lessonRoute(pathname: string): { courseId: string; m: number; l: number } | null {
  const match = /^\/course\/([^/]+)\/(\d+)\/(\d+)\/?$/.exec(pathname);
  if (!match) return null;
  return { courseId: decodeURIComponent(match[1]), m: Number(match[2]), l: Number(match[3]) };
}

function courseRoute(pathname: string): string | null {
  const match = /^\/course\/([^/]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export function actionItems(prep: PreparedIndex | null, ctx: PaletteContext): PaletteItem[] {
  const out: PaletteItem[] = [];
  const onLesson = lessonRoute(ctx.pathname) !== null;
  if (onLesson) {
    for (const a of LESSON_ACTIONS) {
      out.push({
        key: `a:${a.id}`,
        kind: "action",
        title: a.label,
        subtitle: "Player",
        action: a.id,
        hint: a.hint,
        fields: [f(a.label, 1), f(a.keywords, 0.7)],
      });
    }
  }
  for (const a of GLOBAL_ACTIONS) {
    if (a.id === "resume" && !(prep && prep.recent.length > 0)) continue;
    out.push({
      key: `a:${a.id}`,
      kind: "action",
      title: a.label,
      subtitle: a.id === "resume" && prep ? prep.recent[0].title : undefined,
      action: a.id,
      href: a.id === "resume" && prep ? prep.recent[0].href : undefined,
      hint: a.hint,
      fields: [f(a.label, 1), f(a.keywords, 0.7)],
    });
  }
  return out;
}

export interface ResultGroup {
  id: string;
  label: string;
  items: PaletteItem[];
}

export const GROUP_LIMITS = { courses: 5, lessons: 8, resources: 5, pages: 12, actions: 50 };

const get = (it: PaletteItem) => it.fields;

export function search(prep: PreparedIndex | null, query: string, ctx: PaletteContext): ResultGroup[] {
  const q = query.trim();
  const actions = actionItems(prep, ctx);
  const groups: ResultGroup[] = [];

  if (!q) {
    if (prep && ctx.recentKeys && ctx.recentKeys.length) {
      const all = new Map(prep.byKey);
      for (const a of actions) all.set(a.key, a);
      const items = ctx.recentKeys
        .map((k) => all.get(k))
        .filter((x): x is PaletteItem => Boolean(x))
        .filter((x) => x.action !== "resume");
      if (items.length) groups.push({ id: "recent", label: "Recent", items: items.slice(0, 8) });
    }
    if (prep && prep.recent.length) groups.push({ id: "continue", label: "Continue", items: prep.recent.slice(0, 5) });
    if (prep) {
      const pages = [prep.pages[0], prep.pages[1]];
      const cid = courseRoute(ctx.pathname);
      if (cid) {
        for (const key of [`p:/course/${cid}`, `p:/course/${cid}/resources`]) {
          const it = prep.byKey.get(key);
          if (it) pages.push(it);
        }
      }
      groups.push({ id: "pages", label: "Pages", items: pages });
    }
    const onLesson = lessonRoute(ctx.pathname) !== null;
    const useful = onLesson
      ? actions.filter((a) =>
          ["play-toggle", "next", "prev", "mark-complete", "speed:1.5", "speed:2", "copy-timestamp", "shortcuts"].includes(a.action!)
        )
      : actions;
    groups.push({ id: "actions", label: "Actions", items: useful });
    return dedupe(groups);
  }

  const scores = new Map<PaletteItem, number>();
  const push = (id: string, label: string, list: PaletteItem[], limit: number) => {
    const ranked = rank(list, get, q, limit);
    for (const r of ranked) scores.set(r.item, r.score);
    if (ranked.length) groups.push({ id, label, items: ranked.map((r) => r.item) });
  };
  if (prep) {
    push("courses", "Courses", prep.courses, GROUP_LIMITS.courses);
    push("lessons", "Lessons", prep.lessons, GROUP_LIMITS.lessons);
    push("resources", "Resources", prep.resources, GROUP_LIMITS.resources);
    // Pages are ranked after dropping those that duplicate a course row.
    push("pages", "Pages", prep.pages, GROUP_LIMITS.pages + GROUP_LIMITS.courses);
  }
  push("actions", "Actions", actions, GROUP_LIMITS.actions);

  // Dedupe in the default order (a course row beats its overview page), then
  // order groups by their best surviving match so Enter picks the best hit.
  // Ties keep the default order: Courses, Lessons, Resources, Pages, Actions.
  const out = dedupe(groups);
  const pages = out.find((g) => g.id === "pages");
  if (pages) pages.items = pages.items.slice(0, GROUP_LIMITS.pages);
  const best = (g: ResultGroup) => scores.get(g.items[0]) ?? 0;
  out.sort((a, b) => best(b) - best(a));
  out.push({
    id: "all",
    label: "Search",
    items: [
      {
        key: `s:${q}`,
        kind: "search",
        title: `See all results for "${q}"`,
        href: `/search?q=${encodeURIComponent(q)}`,
        fields: [],
      },
    ],
  });
  return out.filter((g) => g.items.length > 0);
}

// The same href must not appear twice (a course row and its overview page).
function dedupe(groups: ResultGroup[]): ResultGroup[] {
  const seen = new Set<string>();
  for (const g of groups) {
    g.items = g.items.filter((it) => {
      const id = it.href && !it.action ? `h:${it.href}` : it.key;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  return groups.filter((g) => g.items.length > 0);
}
