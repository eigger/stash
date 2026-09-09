import { buildApp } from "./app.js";
import { startExpiryNotificationJob } from "./jobs/expiryNotifications.js";
import { startTrashPurgeJob } from "./jobs/trashPurge.js";
import { startLowStockSummaryJob } from "./jobs/lowStockSummary.js";
import { startBackupSweepJob } from "./jobs/backupSweep.js";

const app = await buildApp();

startExpiryNotificationJob();
startTrashPurgeJob();
startLowStockSummaryJob();
startBackupSweepJob();

const port = Number(process.env.PORT ?? 8080);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
