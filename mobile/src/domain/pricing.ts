export function effectiveUnitPrice(args: {
  quantity: number;
  retailPrice: number;
  wholesalePrice?: number | null;
  minWholesaleQty?: number | null;
}): number {
  const {quantity, retailPrice, wholesalePrice, minWholesaleQty} = args;
  if (
    wholesalePrice != null &&
    minWholesaleQty != null &&
    quantity >= minWholesaleQty
  ) {
    return wholesalePrice;
  }
  return retailPrice;
}

export function lineTotal(args: {
  quantity: number;
  retailPrice: number;
  wholesalePrice?: number | null;
  minWholesaleQty?: number | null;
}): number {
  return args.quantity * effectiveUnitPrice(args);
}

export function lineSavings(args: {
  quantity: number;
  retailPrice: number;
  wholesalePrice?: number | null;
  minWholesaleQty?: number | null;
}): number {
  const retailTotal = args.quantity * args.retailPrice;
  const effective = lineTotal(args);
  const diff = retailTotal - effective;
  return diff > 0 ? diff : 0;
}
