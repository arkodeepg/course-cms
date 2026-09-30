import { hasUnplayableExtension, resolveResumePosition, stepSpeed } from "@/lib/playback";

describe("resolveResumePosition", () => {
  it("resumes a normal saved position", () => {
    expect(resolveResumePosition(120, 600, false)).toBe(120);
  });
  it("restarts when within 15 s of the end", () => {
    expect(resolveResumePosition(590, 600, false)).toBe(0);
    expect(resolveResumePosition(585, 600, false)).toBe(0);
  });
  it("restarts a completed lesson at 90 percent or later", () => {
    expect(resolveResumePosition(540, 600, true)).toBe(0);
    expect(resolveResumePosition(540, 600, false)).toBe(540);
  });
  it("keeps the position when duration is unknown", () => {
    expect(resolveResumePosition(42, NaN, true)).toBe(42);
  });
  it("returns 0 for nothing saved", () => {
    expect(resolveResumePosition(0, 600, false)).toBe(0);
  });
});

describe("stepSpeed", () => {
  it("steps along the ladder and clamps", () => {
    expect(stepSpeed(1, 1)).toBe(1.25);
    expect(stepSpeed(1, -1)).toBe(0.75);
    expect(stepSpeed(0.75, -1)).toBe(0.75);
    expect(stepSpeed(3, 1)).toBe(3);
  });
  it("snaps an off-ladder rate", () => {
    expect(stepSpeed(1.1, 1)).toBe(1.25);
    expect(stepSpeed(1.1, -1)).toBe(1);
  });
});

describe("hasUnplayableExtension", () => {
  it("flags containers browsers cannot play", () => {
    expect(hasUnplayableExtension("a/b/Lesson.AVI")).toBe(true);
    expect(hasUnplayableExtension("x.mkv")).toBe(true);
    expect(hasUnplayableExtension("x.mp4")).toBe(false);
  });
});
