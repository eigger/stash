import { UPLOAD_DIR } from "../lib/uploads.js";
import { sweepStaleBackupArtifacts } from "../lib/backupFiles.js";

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * 중단된 백업·복원 찌꺼기를 걷는다.
 *
 * 내보내기의 정리 핸들러는 **빌드가 끝난 뒤에야** 걸린다. 빌드는 첨부가 많으면 분
 * 단위인데 그동안 탭을 닫으면 이미 지나간 close 이벤트는 다시 오지 않아, uploads
 * 사본과 아카이브가 그대로 남는다. 프로세스가 죽어도 마찬가지다. 지금까지 이걸
 * 걷는 주체가 없어 누를 때마다 쌓였다.
 *
 * 기동 시 한 번, 이후 매시간 돈다.
 */
export function startBackupSweepJob(): void {
  const run = () => {
    sweepStaleBackupArtifacts(UPLOAD_DIR)
      .then((swept) => {
        if (swept.length > 0) {
          console.warn(`[backup-sweep] removed ${swept.length} stale backup artifact(s)`);
        }
      })
      .catch((err) => console.error("[backup-sweep] failed", err));
  };

  run();
  setInterval(run, SWEEP_INTERVAL_MS).unref();
}
