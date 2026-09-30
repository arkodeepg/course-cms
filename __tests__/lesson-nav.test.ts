import { computeLessonNav, lessonTitle } from "@/lib/lesson-nav";
import type { CourseIndex, Lesson } from "@/types/course";

function lesson(name: string): Lesson {
  return { index: 0, name, url: "", file: `${name}.mp4`, status: "ok", has_description: false };
}

function course(modules: string[][][]): CourseIndex {
  return {
    course: "c",
    total_lessons: 0,
    downloaded: 0,
    missing: 0,
    categories: modules.map((sections, mi) => ({
      index: mi + 1,
      name: `M${mi + 1}`,
      folder: `m${mi + 1}`,
      sections: sections.map((names, si) => ({
        index: si + 1,
        name: `S${si + 1}`,
        folder: `s${si + 1}`,
        lessons: names.map(lesson),
      })),
    })),
  };
}

// Module 1: two sections (a1, a2 | a3). Module 2: b1, b2. Module 3 empty. Module 4: d1.
const idx = course([[["a1", "a2"], ["a3"]], [["b1", "b2"]], [], [["d1"]]]);

describe("computeLessonNav", () => {
  it("first lesson of the course has no prev", () => {
    const nav = computeLessonNav("c", idx, 1, 1);
    expect(nav.prevHref).toBeNull();
    expect(nav.nextHref).toBe("/course/c/1/2");
    expect(nav.nextTitle).toBe("a2");
  });

  it("last lesson of the course has no next", () => {
    const nav = computeLessonNav("c", idx, 4, 1);
    expect(nav.nextHref).toBeNull();
    expect(nav.nextTitle).toBeNull();
    // skips the empty module 3 going back
    expect(nav.prevHref).toBe("/course/c/2/2");
  });

  it("walks across sections inside a module", () => {
    const nav = computeLessonNav("c", idx, 1, 2);
    expect(nav.prevHref).toBe("/course/c/1/1");
    expect(nav.nextHref).toBe("/course/c/1/3");
  });

  it("last lesson of module N leads to lesson 1 of module N+1", () => {
    const nav = computeLessonNav("c", idx, 1, 3);
    expect(nav.nextHref).toBe("/course/c/2/1");
    expect(nav.nextTitle).toBe("b1");
  });

  it("first lesson of module N leads back to the last lesson of module N-1", () => {
    const nav = computeLessonNav("c", idx, 2, 1);
    expect(nav.prevHref).toBe("/course/c/1/3");
  });

  it("skips empty modules going forward", () => {
    const nav = computeLessonNav("c", idx, 2, 2);
    expect(nav.nextHref).toBe("/course/c/4/1");
  });

  it("single-module course stays inside the module and ends at both edges", () => {
    const one = course([[["x1", "x2", "x3"]]]);
    expect(computeLessonNav("c", one, 1, 1).prevHref).toBeNull();
    expect(computeLessonNav("c", one, 1, 2)).toMatchObject({
      prevHref: "/course/c/1/1",
      nextHref: "/course/c/1/3",
    });
    expect(computeLessonNav("c", one, 1, 3).nextHref).toBeNull();
  });

  it("single-lesson course has neither", () => {
    const nav = computeLessonNav("c", course([[["only"]]]), 1, 1);
    expect(nav.prevHref).toBeNull();
    expect(nav.nextHref).toBeNull();
  });
});

describe("lessonTitle", () => {
  it("uses the trimmed first line", () => {
    expect(lessonTitle({ name: "  Intro  \nlong description" })).toBe("Intro");
  });
});
