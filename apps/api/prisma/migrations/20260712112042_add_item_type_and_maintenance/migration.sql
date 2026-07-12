-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('CONSUMABLE', 'ASSET');

-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('NEW', 'IN_USE', 'NEEDS_REPAIR', 'RETIRED');

-- AlterEnum
ALTER TYPE "BarcodeSource" ADD VALUE 'SERIAL';

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "condition" "ItemCondition",
ADD COLUMN     "itemType" "ItemType" NOT NULL DEFAULT 'CONSUMABLE';

-- CreateTable
CREATE TABLE "MaintenanceRecord" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "cost" DOUBLE PRECISION,
    "currency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenanceRecord_itemId_date_idx" ON "MaintenanceRecord"("itemId", "date");

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
