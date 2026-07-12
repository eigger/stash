import { beforeEach, describe, expect, it } from "vitest";
import { loadRecentIds, pushRecentId } from "./recentSelections";

const KEY = "stash_recent_test";

describe("recentSelections", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts empty", () => {
    expect(loadRecentIds(KEY)).toEqual([]);
  });

  it("adds ids most-recent-first", () => {
    pushRecentId(KEY, "a");
    pushRecentId(KEY, "b");
    expect(loadRecentIds(KEY)).toEqual(["b", "a"]);
  });

  it("moves a re-picked id back to the front instead of duplicating it", () => {
    pushRecentId(KEY, "a");
    pushRecentId(KEY, "b");
    pushRecentId(KEY, "a");
    expect(loadRecentIds(KEY)).toEqual(["a", "b"]);
  });

  it("caps the list at 5 entries", () => {
    for (const id of ["a", "b", "c", "d", "e", "f"]) pushRecentId(KEY, id);
    expect(loadRecentIds(KEY)).toEqual(["f", "e", "d", "c", "b"]);
  });

  it("ignores an empty id", () => {
    pushRecentId(KEY, "");
    expect(loadRecentIds(KEY)).toEqual([]);
  });

  it("recovers from corrupted JSON instead of throwing", () => {
    localStorage.setItem(KEY, "{not json");
    expect(loadRecentIds(KEY)).toEqual([]);
  });
});
