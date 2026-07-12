export type UserRole = "ADMIN" | "GENERAL";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export type BarcodeSymbology = "EAN13" | "UPCA" | "CODE128" | "QR" | "DATA_MATRIX" | "OTHER";
export type BarcodeSource = "GENERATED" | "EXISTING" | "MATTER" | "SERIAL";

export interface Barcode {
  id: string;
  itemId: string;
  value: string;
  symbology: BarcodeSymbology;
  source: BarcodeSource;
  isPrimary: boolean;
}

export interface Location {
  id: string;
  name: string;
  parentId: string | null;
  photoUrl: string | null;
  notes: string | null;
  _count?: { items: number };
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  _count?: { items: number };
}

export interface Attachment {
  id: string;
  filePath: string;
  mimeType: string;
  uploadedAt: string;
}

export type StockMovementReason = "RESTOCK" | "CONSUME" | "ADJUST";

export interface StockMovement {
  id: string;
  itemId: string;
  delta: number;
  reason: StockMovementReason;
  occurredAt: string;
}

export interface StockMovementWithItem extends StockMovement {
  item: { id: string; name: string; photoUrl: string | null; unit: string | null };
  user: { id: string; name: string } | null;
}

export type ItemType = "CONSUMABLE" | "ASSET";
export type ItemCondition = "NEW" | "IN_USE" | "NEEDS_REPAIR" | "RETIRED";

export interface MaintenanceRecord {
  id: string;
  itemId: string;
  date: string;
  description: string;
  cost: number | null;
  currency: string | null;
  createdAt: string;
}

export interface Item {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  locationId: string | null;
  categoryId: string | null;
  minQuantity: number | null;
  purchaseDate: string | null;
  price: number | null;
  currency: string | null;
  expiryDate: string | null;
  warrantyExpiresAt: string | null;
  photoUrl: string | null;
  notes: string | null;
  wanted: boolean;
  itemType: ItemType;
  condition: ItemCondition | null;
  createdAt: string;
  updatedAt: string;
  lastAuditedAt: string | null;
  location: Location | null;
  category: Category | null;
  barcodes: Barcode[];
  attachments?: Attachment[];
  movements?: StockMovement[];
  maintenanceRecords?: MaintenanceRecord[];
}

export interface ScanResult {
  item: Item;
  matched: boolean;
  created: boolean;
  lookup?: { found: boolean; name?: string; brand?: string; imageUrl?: string };
}
