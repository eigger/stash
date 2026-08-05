-- CreateEnum
CREATE TYPE "AuditSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuditCheckStatus" AS ENUM ('PENDING', 'FOUND', 'UNEXPECTED');

-- CreateTable
CREATE TABLE "AuditSession" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "includeChildren" BOOLEAN NOT NULL DEFAULT true,
    "status" "AuditSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AuditSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditCheck" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "expectedQuantity" INTEGER NOT NULL,
    "actualQuantity" INTEGER,
    "status" "AuditCheckStatus" NOT NULL DEFAULT 'PENDING',
    "checkedAt" TIMESTAMP(3),

    CONSTRAINT "AuditCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditSession_status_idx" ON "AuditSession"("status");

-- CreateIndex
CREATE INDEX "AuditCheck_sessionId_status_idx" ON "AuditCheck"("sessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AuditCheck_sessionId_itemId_key" ON "AuditCheck"("sessionId", "itemId");

-- AddForeignKey
ALTER TABLE "AuditSession" ADD CONSTRAINT "AuditSession_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditSession" ADD CONSTRAINT "AuditSession_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditCheck" ADD CONSTRAINT "AuditCheck_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AuditSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditCheck" ADD CONSTRAINT "AuditCheck_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
