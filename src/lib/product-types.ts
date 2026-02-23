/**
 * Fixed list of product types (soort) for RFQ filtering and display.
 * Used in RFQ create wizard and dashboard filter.
 */
export const PRODUCT_TYPES = [
  'Bar chairs',
  'Bar tables',
  'Baskets, planters & pots',
  'Bathroom',
  'Benches & chairs',
  'Cabinets & consoles',
  'Carafes',
  'Coffee & side tables',
  'Decorative glassware',
  'Drinking glasses',
  'Furniture',
  'Glassware & Decoration',
  'Kitchenware',
  'Lighting',
  'Lounge sets',
  'Ornaments & more',
  'Pillows',
  'Pouffe',
  'Sunbeds',
  'Tables',
  'Tableware',
  'Umbrellas',
  'Vases',
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];

export function isProductType(value: string): value is ProductType {
  return (PRODUCT_TYPES as readonly string[]).includes(value);
}
