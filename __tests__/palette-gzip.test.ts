import { gunzipSync } from "zlib";
import { acceptsGzip, gzipForEtag } from "@/lib/palette-index";

describe("palette gzip", () => {
  test("parses Accept-Encoding", () => {
    expect(acceptsGzip("gzip, deflate, br")).toBe(true);
    expect(acceptsGzip("br;q=1.0, gzip;q=0.8")).toBe(true);
    expect(acceptsGzip("gzip;q=0")).toBe(false);
    expect(acceptsGzip("identity")).toBe(false);
    expect(acceptsGzip("*")).toBe(true);
    expect(acceptsGzip("*, gzip;q=0")).toBe(false);
    expect(acceptsGzip("")).toBe(false);
    expect(acceptsGzip(null)).toBe(false);
  });

  test("compresses once per ETag and round-trips", () => {
    const body = JSON.stringify({ lessons: Array.from({ length: 2000 }, (_, i) => [0, 1, i, `Lesson ${i}`]) });
    const a = gzipForEtag('"one"', body);
    const b = gzipForEtag('"one"', body);
    expect(b).toBe(a); // same Buffer object: cached
    expect(a.length).toBeLessThan(body.length / 3);
    expect(gunzipSync(a).toString("utf8")).toBe(body);
    const c = gzipForEtag('"two"', body + " ");
    expect(c).not.toBe(a);
    expect(gunzipSync(c).toString("utf8")).toBe(body + " ");
  });
});
