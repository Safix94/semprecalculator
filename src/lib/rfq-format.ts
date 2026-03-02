interface RfqDimensionInput {
  shape: string;
  length: number;
  width: number;
  height: number;
  thickness: number;
}

export function normalizeProductType(productType: string | null | undefined): string {
  return (productType ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isTablesProductType(productType: string | null | undefined): boolean {
  return normalizeProductType(productType) === 'tables';
}

export function isTableTopsProductType(productType: string | null | undefined): boolean {
  const normalized = normalizeProductType(productType);
  return normalized === 'table tops' || normalized === 'tabletops';
}

export function isRoundShape(shape: string | null | undefined): boolean {
  return (shape ?? '').trim().toLowerCase() === 'round';
}

export function formatRfqDimensions(input: RfqDimensionInput): string {
  return formatRfqDimensionsWithOptions(input, { includeThickness: true });
}

export function formatRfqDimensionsWithOptions(
  input: RfqDimensionInput,
  options: { includeThickness: boolean }
): string {
  if (isRoundShape(input.shape)) {
    const base = `Ø ${input.length} x ${input.height} cm`;
    return options.includeThickness && input.thickness > 0
      ? `${base} (+ ${input.thickness} cm thickness)`
      : base;
  }

  const base = `${input.length} x ${input.width} x ${input.height} cm`;
  return options.includeThickness && input.thickness > 0 ? `${base} (d:${input.thickness})` : base;
}
