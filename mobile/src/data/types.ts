export type PriceSource = 'label' | 'nfce' | 'manual';
export type TrustLevel = 'verified' | 'suspect' | 'hidden';
export type ReceiptStatus =
  | 'queued'
  | 'fetching'
  | 'parsed'
  | 'review'
  | 'failed'
  | 'done';
export type FiscalLevel = 'bronze' | 'silver' | 'gold';
export type VoteType = 'confirm' | 'reject';

export type Product = {
  id: number;
  name: string;
  aliasesJson: string;
  category: string | null;
  remoteId: string | null;
  updatedAt: string;
  synced: number;
};

export type Market = {
  id: number;
  name: string;
  cnpj: string | null;
  uf: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  avgRating: number | null;
  ratingsCount: number;
  priceLevel: string | null;
  remoteId: string | null;
  updatedAt: string;
  synced: number;
};

export type PriceLog = {
  id: number;
  productId: number;
  marketId: number | null;
  retailPrice: number;
  wholesalePrice: number | null;
  minWholesaleQty: number | null;
  source: PriceSource;
  capturedAt: string;
  remoteId: string | null;
  nfceKey: string | null;
  confirmScore: number;
  rejectScore: number;
  trustLevel: TrustLevel;
  lastConfirmedAt: string | null;
  contributorId: string | null;
  updatedAt: string;
  synced: number;
};

export type CartItem = {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  retailPrice: number;
  wholesalePrice: number | null;
  minWholesaleQty: number | null;
  checkedOff: number;
  updatedAt: string;
};

export type ShoppingList = {
  id: number;
  name: string;
  marketId: number | null;
  marketName: string | null;
  itemsJson: string;
  subtotal: number;
  savings: number;
  itemCount: number;
  finishedAt: string;
  remoteId: string | null;
  updatedAt: string;
  synced: number;
};

export type PendingReceipt = {
  id: number;
  qrUrl: string;
  nfceKey: string | null;
  status: ReceiptStatus;
  parsedPayloadJson: string | null;
  marketName: string | null;
  marketCnpj: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  synced: number;
};

export type MarketReview = {
  id: number;
  marketId: number;
  marketRemoteId: string | null;
  stars: number;
  comment: string | null;
  voterHash: string;
  createdAt: string;
  remoteId: string | null;
  synced: number;
};

export type UserReputation = {
  id: number;
  userId: string;
  points: number;
  level: FiscalLevel;
  validationsCount: number;
  badges: string[];
  updatedAt: string;
};

export type UserLocationPrefs = {
  city: string;
  neighborhood: string;
  favoriteMarketIds: number[];
};
