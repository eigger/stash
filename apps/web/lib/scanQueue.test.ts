import { beforeEach, describe, expect, it } from "vitest";
import { enqueueScan, getScanQueue, removeFromScanQueue } from "./scanQueue";

describe("scanQueue", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts empty", () => {
    expect(getScanQueue()).toEqual([]);
  });

  it("enqueues scans with a unique id and timestamp", () => {
    enqueueScan({ barcodeValue: "123", delta: 1 });
    enqueueScan({ barcodeValue: "456", delta: -1 });

    const queue = getScanQueue();
    expect(queue).toHaveLength(2);
    expect(queue[0]).toMatchObject({ barcodeValue: "123", delta: 1 });
    expect(queue[1]).toMatchObject({ barcodeValue: "456", delta: -1 });
    expect(queue[0].id).not.toEqual(queue[1].id);
  });

  it("removes only the entry with the matching id", () => {
    enqueueScan({ barcodeValue: "123", delta: 1 });
    enqueueScan({ barcodeValue: "456", delta: -1 });
    const [first, second] = getScanQueue();

    removeFromScanQueue(first.id);

    const remaining = getScanQueue();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(second.id);
  });

  it("recovers from corrupted JSON instead of throwing", () => {
    localStorage.setItem("stash_scan_queue", "{not json");
    expect(getScanQueue()).toEqual([]);
  });
});
