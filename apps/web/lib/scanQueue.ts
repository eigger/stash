// 오프라인일 때 스캔한 바코드를 로컬에 쌓아뒀다가, 온라인으로 돌아오면 자동으로
// 다시 보낸다 (scan/page.tsx). 여러 페이지/탭에서 공유하지 않아도 되는 단순한
// 큐라 localStorage로 충분하다 — 이 앱의 다른 클라이언트 상태와 같은 패턴.
const QUEUE_KEY = "stash_scan_queue";

export interface QueuedScan {
  id: string;
  barcodeValue: string;
  delta: number;
  queuedAt: number;
}

// 같은 밀리초에 두 건이 들어와도 항목을 구분할 수 있도록 timestamp가 아닌 고유 id로 식별한다.
function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getScanQueue(): QueuedScan[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveScanQueue(queue: QueuedScan[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function enqueueScan(entry: { barcodeValue: string; delta: number }): void {
  saveScanQueue([...getScanQueue(), { id: newId(), queuedAt: Date.now(), ...entry }]);
}

// 항목별 고유 id로만 지운다 — timestamp로 지우면 같은 ms의 형제 항목이 함께 삭제되어
// 아직 못 보낸 스캔이 유실될 수 있다.
export function removeFromScanQueue(id: string): void {
  saveScanQueue(getScanQueue().filter((q) => q.id !== id));
}
