export interface MaterialFinishSource {
  finish_options?: string[] | null;
  finish_options_color?: string[] | null;
}

export function normalizeFinishOptions(options: string[] | null | undefined): string[] {
  return (options ?? []).map((finish) => finish.trim()).filter((finish) => finish.length > 0);
}

/**
 * Finishes offered in the standard "Finish" dropdown (every product type that is
 * not Table tops). Materials that only have colour finishes configured (the Table
 * tops "Color" list) use that list, so e.g. Recycled oak on a Table foot still
 * asks for Fumé / Original / … instead of showing no finish question.
 */
export function getGeneralFinishOptions(material: MaterialFinishSource | null | undefined): string[] {
  if (!material) {
    return [];
  }

  const general = normalizeFinishOptions(material.finish_options);
  if (general.length > 0) {
    return general;
  }

  return normalizeFinishOptions(material.finish_options_color);
}
