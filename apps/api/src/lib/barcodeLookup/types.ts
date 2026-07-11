export interface ProductLookupResult {
  found: boolean;
  name?: string;
  brand?: string;
  imageUrl?: string;
  provider: string;
  raw?: unknown;
}

export interface ProductLookupProvider {
  name: string;
  lookup(barcodeValue: string): Promise<ProductLookupResult | null>;
}
