import { choosePreload, SSR_PRELOAD } from "@/lib/preload";

describe("choosePreload", () => {
  it("keeps auto on a desktop with a fine pointer and no Save-Data", () => {
    expect(choosePreload({ coarsePointer: false, saveData: false })).toBe("auto");
    expect(choosePreload({ coarsePointer: false })).toBe("auto");
    expect(choosePreload({ coarsePointer: false, saveData: null })).toBe("auto");
  });

  it("uses metadata on coarse pointers", () => {
    expect(choosePreload({ coarsePointer: true, saveData: false })).toBe("metadata");
  });

  it("uses metadata when Save-Data is on, even on a desktop", () => {
    expect(choosePreload({ coarsePointer: false, saveData: true })).toBe("metadata");
  });

  it("upgrades to auto once the viewer has pressed play", () => {
    expect(choosePreload({ coarsePointer: true, saveData: true, hasPlayed: true })).toBe("auto");
  });

  it("renders metadata on the server so the client can only upgrade", () => {
    expect(SSR_PRELOAD).toBe("metadata");
  });
});
