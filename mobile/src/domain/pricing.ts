export type PricedLine = {
  quantity: number;
  retailPrice: number;
  wholesalePrice?: number | null;
  minWholesaleQty?: number | null;
  /** 1 = usar atacado; 0 = varejo; omitido = legado (cota mín.). */
  useWholesale?: number | boolean | null;
};

function wantsWholesale(args: PricedLine): boolean {
  if (args.wholesalePrice == null) return false;
  if (args.useWholesale === 1 || args.useWholesale === true) return true;
  if (args.useWholesale === 0 || args.useWholesale === false) return false;
  return (
    args.minWholesaleQty != null && args.quantity >= args.minWholesaleQty
  );
}

export function effectiveUnitPrice(args: PricedLine): number {
  if (wantsWholesale(args) && args.wholesalePrice != null) {
    return args.wholesalePrice;
  }
  return args.retailPrice;
}

export function lineTotal(args: PricedLine): number {
  return args.quantity * effectiveUnitPrice(args);
}

export function lineSavings(args: PricedLine): number {
  const retailTotal = args.quantity * args.retailPrice;
  const effective = lineTotal(args);
  const diff = retailTotal - effective;
  return diff > 0 ? diff : 0;
}

export function lineRetailTotal(args: PricedLine): number {
  return args.quantity * args.retailPrice;
}

export function lineWholesaleTotal(args: PricedLine): number {
  const unit = args.wholesalePrice ?? args.retailPrice;
  return args.quantity * unit;
}
