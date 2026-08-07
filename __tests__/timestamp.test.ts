import {
  parseTimestamp,
  resolveStartPosition,
  formatTimestampParam,
} from "@/lib/timestamp";

describe("parseTimestamp", () => {
  it("reads plain seconds", () => {
    expect(parseTimestamp("90")).toBe(90);
    expect(parseTimestamp("0")).toBe(0);
    expect(parseTimestamp(" 3600 ")).toBe(3600);
  });

  it("reads unit form", () => {
    expect(parseTimestamp("90s")).toBe(90);
    expect(parseTimestamp("1m30s")).toBe(90);
    expect(parseTimestamp("1h2m3s")).toBe(3723);
    expect(parseTimestamp("2m")).toBe(120);
    expect(parseTimestamp("1H2M3S")).toBe(3723);
  });

  it("reads clock form", () => {
    expect(parseTimestamp("1:30")).toBe(90);
    expect(parseTimestamp("1:02:30")).toBe(3750);
    expect(parseTimestamp("0:05")).toBe(5);
  });

  it("rejects junk", () => {
    expect(parseTimestamp("abc")).toBeNull();
    expect(parseTimestamp("")).toBeNull();
    expect(parseTimestamp("   ")).toBeNull();
    expect(parseTimestamp("-90")).toBeNull();
    expect(parseTimestamp("1.5")).toBeNull();
    expect(parseTimestamp("1:2:3:4")).toBeNull();
    expect(parseTimestamp("90x")).toBeNull();
    expect(parseTimestamp(undefined)).toBeNull();
    expect(parseTimestamp(["90", "120"])).toBeNull();
  });
});

describe("resolveStartPosition", () => {
  it("lets an explicit t beat saved progress", () => {
    expect(resolveStartPosition("1m30s", 400)).toBe(90);
  });

  it("falls back to saved progress when t is absent or junk", () => {
    expect(resolveStartPosition(undefined, 400)).toBe(400);
    expect(resolveStartPosition("banana", 400)).toBe(400);
  });

  it("starts at zero with neither", () => {
    expect(resolveStartPosition(undefined, null)).toBe(0);
    expect(resolveStartPosition(undefined, undefined)).toBe(0);
  });
});

describe("formatTimestampParam", () => {
  it("floors to whole seconds and clamps negatives", () => {
    expect(formatTimestampParam(90.7)).toBe("90");
    expect(formatTimestampParam(0)).toBe("0");
    expect(formatTimestampParam(-3)).toBe("0");
  });
});
