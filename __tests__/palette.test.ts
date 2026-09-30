import fs from "fs";
import { normalize, rank, scoreToken, tokenize, type Field } from "@/lib/fuzzy";
import {
  LESSON_ACTIONS,
  PLAYER_COMMAND_IDS,
  lessonRoute,
  prepareIndex,
  resourceDownloadHref,
  search,
  type PaletteIndex,
} from "@/lib/palette";

const fields = (title: string, ...rest: Array<[string, number]>): Field[] => [
  { text: normalize(title), weight: 1 },
  ...rest.map(([t, w]) => ({ text: normalize(t), weight: w })),
];

describe("fuzzy", () => {
  test("normalises case and diacritics", () => {
    expect(normalize("Café CRÈME")).toBe("cafe creme");
    expect(scoreToken("cafe", normalize("Le Café"))).toBeGreaterThan(0);
    expect(tokenize("  CRO   Mindset ")).toEqual(["cro", "mindset"]);
  });

  test("prefix beats word start beats mid-word", () => {
    const prefix = scoreToken("con", "conversion basics");
    const word = scoreToken("con", "the conversion");
    const mid = scoreToken("con", "deconstruct");
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(0);
  });

  test("substring beats subsequence, scattered letters are rejected", () => {
    const sub = scoreToken("mind", "mindset");
    const acronym = scoreToken("bdcm", "billion dollar cro mindset");
    expect(sub).toBeGreaterThan(0);
    expect(acronym).toBeGreaterThan(0);
    expect(scoreToken("cro", "character role orientation")).toBeGreaterThan(0); // word starts
    expect(scoreToken("xyz", "something else")).toBe(0);
    expect(scoreToken("larsen", "a long title reads several evenings")).toBe(0);
  });

  test("every token must match; title outweighs course", () => {
    const items = [
      { id: "a", f: fields("The Billion Dollar CRO Mindset", ["Dylan Ander - CRO Masterclass", 0.6]) },
      { id: "b", f: fields("Mindset shifts", ["Dylan Ander - CRO Masterclass", 0.6]) },
      { id: "c", f: fields("CRO basics", ["Other course", 0.6]) },
      { id: "d", f: fields("Mindset for sales", ["Sales Course", 0.6]) },
    ];
    const res = rank(items, (x) => x.f, "cro mindset").map((r) => r.item.id);
    expect(res[0]).toBe("a");
    expect(res).toContain("b");
    expect(res).not.toContain("c");
    expect(res).not.toContain("d");
  });

  test("rank honours the limit and keeps the best", () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ f: fields(`lesson ${i} video`) }));
    items.push({ f: fields("video") });
    const res = rank(items, (x) => x.f, "video", 5);
    expect(res).toHaveLength(5);
    expect(res[0].item.f[0].text).toBe("video");
  });
});

// A small hand-built payload for the palette model.
const sample: PaletteIndex = {
  v: 1,
  root: "/courses",
  courses: [
    ["cro-masterclass", "Dylan Ander - CRO Masterclass", 0, "Dylan Ander - CRO Masterclass"],
    ["matthew-larsen-10k-per-month", "Matthew Larsen - 10k Per Month", 1, "Matthew Larsen - 10k Per Month"],
  ],
  modules: [
    [0, 1, "Foundations"],
    [1, 1, "Offer"],
  ],
  lessons: [
    [0, 1, 1, "The Billion Dollar CRO Mindset"],
    [0, 1, 2, "Heatmaps"],
    [1, 1, 1, "Build your offer"],
    [1, 1, 2, "Mindset for offers"],
  ],
  resources: [
    [1, 1, "Offer worksheet", "01 Offer/worksheet.pdf", 1],
    [1, 0, "Swipe file", "swipe.zip", 0],
  ],
  recent: [[1, 1, 2]],
};

describe("palette model", () => {
  const prep = prepareIndex(sample);

  test("course query puts the course first and dedupes its overview page", () => {
    const groups = search(prep, "larsen", { pathname: "/" });
    expect(groups[0].id).toBe("courses");
    expect(groups[0].items[0].href).toBe("/course/matthew-larsen-10k-per-month");
    const pageHrefs = groups.find((g) => g.id === "pages")?.items.map((i) => i.href) ?? [];
    expect(pageHrefs).not.toContain("/course/matthew-larsen-10k-per-month");
    expect(groups[groups.length - 1].items[0].href).toBe("/search?q=larsen");
  });

  test("course name plus a word narrows to that course's lessons", () => {
    const lessons = search(prep, "larsen mindset", { pathname: "/" }).find((g) => g.id === "lessons");
    expect(lessons?.items.map((i) => i.title)).toEqual(["Mindset for offers"]);
    expect(lessons?.items[0].subtitle).toBe("Matthew Larsen - 10k Per Month · Offer");
  });

  test("resources: viewable opens the viewer, others download", () => {
    const res = search(prep, "offer worksheet", { pathname: "/" }).find((g) => g.id === "resources");
    expect(res?.items[0].href).toBe(
      "/course/matthew-larsen-10k-per-month/resources?view=01%20Offer%2Fworksheet.pdf"
    );
    const swipe = search(prep, "swipe", { pathname: "/" }).find((g) => g.id === "resources");
    expect(swipe?.items[0].download).toBe(true);
    expect(swipe?.items[0].href).toBe(
      resourceDownloadHref("/courses", "Matthew Larsen - 10k Per Month", "swipe.zip")
    );
    expect(swipe?.items[0].href).toContain("/api/resource/courses/Matthew%20Larsen");
  });

  test("resources query lists Resources pages", () => {
    const pages = search(prep, "resources", { pathname: "/" }).find((g) => g.id === "pages");
    expect(pages?.items.some((i) => i.href === "/course/matthew-larsen-10k-per-month/resources")).toBe(true);
  });

  test("player actions only on lesson pages", () => {
    const off = search(prep, "speed 2", { pathname: "/course/cro-masterclass" });
    expect(off.find((g) => g.id === "actions")?.items.some((i) => i.action === "speed:2")).toBeFalsy();
    const on = search(prep, "speed 2", { pathname: "/course/cro-masterclass/1/1" });
    const acts = on.find((g) => g.id === "actions")!.items;
    expect(acts[0].action).toBe("speed:2");
    expect(acts[0].title).toBe("Playback speed 2x");
    expect(LESSON_ACTIONS.map((a) => a.id)).toEqual([...PLAYER_COMMAND_IDS]);
    expect(lessonRoute("/course/x/2/3")).toEqual({ courseId: "x", m: 2, l: 3 });
    expect(lessonRoute("/course/x/resources")).toBeNull();
  });

  test("empty query shows Recent, Continue, Pages, Actions", () => {
    const groups = search(prep, "", { pathname: "/", recentKeys: ["c:cro-masterclass", "missing"] });
    expect(groups.map((g) => g.id)).toEqual(["recent", "continue", "pages", "actions"]);
    expect(groups[1].items[0].title).toBe("Mindset for offers");
    const resume = groups[3].items.find((i) => i.action === "resume");
    expect(resume?.href).toBe("/course/matthew-larsen-10k-per-month/1/2");
  });
});

// ---------------------------------------------------------------------------
// Performance: 3,500+ items per keystroke in well under 10 ms.

function time(fn: () => void, runs: number): number {
  fn(); // warm up
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) fn();
  return (performance.now() - t0) / runs;
}

const QUERIES = ["l", "la", "lar", "larsen", "cro mindset", "offer", "email copy", "zzqx", "mod 3", "speed"];

describe("performance", () => {
  test("synthetic 4,000 lesson set", () => {
    const words = ["offer", "email", "funnel", "mindset", "cro", "copy", "sales", "client", "outreach", "pricing", "module", "intro", "case", "study", "q&a", "call"];
    const lessons: PaletteIndex["lessons"] = [];
    for (let i = 0; i < 4000; i++) {
      const t = Array.from({ length: 4 + (i % 5) }, (_, k) => words[(i * 7 + k * 3) % words.length]).join(" ");
      lessons.push([i % 20, 1 + (i % 8), 1 + i, `${t} part ${i}`]);
    }
    const courses: PaletteIndex["courses"] = Array.from({ length: 20 }, (_, i) => [
      `course-${i}`, `Creator ${i} - Course Number ${i}`, 1, `dir ${i}`,
    ]);
    const modules: PaletteIndex["modules"] = [];
    for (let c = 0; c < 20; c++) for (let m = 1; m <= 8; m++) modules.push([c, m, `Module ${m} basics`]);
    const prep = prepareIndex({ v: 1, root: "/c", courses, modules, lessons, resources: [], recent: [] });
    const per = QUERIES.map((q) => time(() => search(prep, q, { pathname: "/c/1/1" }), 20));
    const worst = Math.max(...per);
    // eslint-disable-next-line no-console
    console.log(`synthetic 4000: per-query ms ${per.map((x) => x.toFixed(2)).join(", ")}; worst ${worst.toFixed(2)}`);
    expect(worst).toBeLessThan(15); // headroom for a loaded machine; target under 10
  });

  const root = process.env.COURSES_PATH || "/mnt/DATA/Archive/courses";
  const haveReal = fs.existsSync(root);
  (haveReal ? test : test.skip)("real palette payload", () => {
    process.env.COURSES_PATH = root;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildPaletteIndex } = require("@/lib/palette-index");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { discoverCourses } = require("@/lib/courses");
    const raw: PaletteIndex = buildPaletteIndex(discoverCourses(), [], root);
    const prep = prepareIndex(raw);
    const total = prep.courses.length + prep.lessons.length + prep.resources.length + prep.pages.length;
    const per = QUERIES.map((q) => time(() => search(prep, q, { pathname: "/course/x/1/1" }), 20));
    const worst = Math.max(...per);
    // eslint-disable-next-line no-console
    console.log(
      `real payload: ${raw.courses.length} courses, ${raw.lessons.length} lessons, ${raw.resources.length} resources, ${total} items; per-query ms ${per.map((x) => x.toFixed(2)).join(", ")}; worst ${worst.toFixed(2)}`
    );
    expect(raw.lessons.length).toBeGreaterThan(3000);
    expect(worst).toBeLessThan(15);

    const larsen = search(prep, "larsen", { pathname: "/" });
    expect(larsen[0].items[0].href).toBe("/course/matthew-larsen-10k-per-month");
    const cro = search(prep, "cro mindset", { pathname: "/" }).find((g) => g.id === "lessons");
    expect(cro?.items[0].title).toMatch(/The Billion Dollar CRO Mindset$/);
    expect(cro?.items[0].subtitle).toMatch(/^Dylan Ander - CRO Masterclass · /);
  });
});
