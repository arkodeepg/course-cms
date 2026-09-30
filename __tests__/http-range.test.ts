import { parseRange } from "@/lib/http-range";

const MB = 1024 * 1024;
const CAP = 8 * MB;
const SIZE = 100 * MB;

describe("parseRange", () => {
  it("returns an explicit window as given", () => {
    expect(parseRange("bytes=0-1023", SIZE, CAP)).toEqual({ start: 0, end: 1023 });
  });

  it("caps an open-ended range at the given size", () => {
    expect(parseRange("bytes=1000-", SIZE, CAP)).toEqual({ start: 1000, end: 1000 + CAP - 1 });
  });

  it("clamps an open-ended range near EOF to the last byte", () => {
    expect(parseRange(`bytes=${SIZE - 10}-`, SIZE, CAP)).toEqual({ start: SIZE - 10, end: SIZE - 1 });
  });

  it("returns the last N bytes for a suffix range", () => {
    expect(parseRange("bytes=-100", SIZE, CAP)).toEqual({ start: SIZE - 100, end: SIZE - 1 });
  });

  it("starts at 0 when the suffix is larger than the file", () => {
    expect(parseRange("bytes=-500", 200, CAP)).toEqual({ start: 0, end: 199 });
  });

  it("rejects a start at or beyond the file size", () => {
    expect(parseRange(`bytes=${SIZE}-`, SIZE, CAP)).toBeNull();
    expect(parseRange(`bytes=${SIZE + 5}-${SIZE + 10}`, SIZE, CAP)).toBeNull();
  });

  it("rejects an end before the start", () => {
    expect(parseRange("bytes=500-100", SIZE, CAP)).toBeNull();
  });

  it("rejects garbage and multi-range headers", () => {
    expect(parseRange("bytes=0-1,5-6", SIZE, CAP)).toBeNull();
    expect(parseRange("bytes=abc-def", SIZE, CAP)).toBeNull();
    expect(parseRange("items=0-10", SIZE, CAP)).toBeNull();
    expect(parseRange("", SIZE, CAP)).toBeNull();
  });

  it("clamps an end beyond the file size to the last byte", () => {
    expect(parseRange("bytes=100-999999999", 1000, CAP)).toEqual({ start: 100, end: 999 });
  });

  it("rejects bytes=-", () => {
    expect(parseRange("bytes=-", SIZE, CAP)).toBeNull();
  });

  it("rejects a zero-length suffix", () => {
    expect(parseRange("bytes=-0", SIZE, CAP)).toBeNull();
  });

  it("rejects any range on an empty file", () => {
    expect(parseRange("bytes=-100", 0, CAP)).toBeNull();
    expect(parseRange("bytes=0-", 0, CAP)).toBeNull();
  });
});
