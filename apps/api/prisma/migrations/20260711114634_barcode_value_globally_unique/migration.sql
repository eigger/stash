-- DropIndex
DROP INDEX "Barcode_itemId_value_key";

-- DropIndex
DROP INDEX "Barcode_value_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Barcode_value_key" ON "Barcode"("value");
