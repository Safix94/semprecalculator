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
  const normalized = normalizeProductType(productType);
  return normalized === 'tables' || normalized === 'table tops' || normalized === 'tabletops';
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
      ? `${base} (+ ${input.thickness} cm thickness top)`
      : base;
  }

  const base = `${input.length} x ${input.width} x ${input.height} cm`;
  return options.includeThickness && input.thickness > 0 ? `${base} (thickness top: ${input.thickness} cm)` : base;
}

export interface TableTopFinishParts {
  top: string | null;
  edge: string | null;
  color: string | null;
}

interface TableTopFinishInput {
  finish_top?: string | null;
  finish_edge?: string | null;
  finish_color?: string | null;
  finish_table_top?: string | null;
}

function cleanFinish(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Table-top requests store the three finishes separately and also as one
 * combined "top / edge / colour" summary in `finish_table_top`. Prefer the
 * separate fields; older requests only have the summary, so split that.
 */
export function getTableTopFinishParts(input: TableTopFinishInput): TableTopFinishParts {
  const top = cleanFinish(input.finish_top);
  const edge = cleanFinish(input.finish_edge);
  const color = cleanFinish(input.finish_color);

  if (top || edge || color) {
    return { top, edge, color };
  }

  const summary = cleanFinish(input.finish_table_top);
  if (!summary) {
    return { top: null, edge: null, color: null };
  }

  const parts = summary.split(' / ').map((part) => part.trim());
  if (parts.length === 3) {
    return { top: cleanFinish(parts[0]), edge: cleanFinish(parts[1]), color: cleanFinish(parts[2]) };
  }

  return { top: summary, edge: null, color: null };
}
