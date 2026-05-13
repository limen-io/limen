// Closed set of parameter transformers (ADR 0007). New transformers are added
// as discrete, named functions. Arbitrary inline transforms are not allowed —
// the long-term direction is to let operators declare normalization in the
// Policy YAML, which only works if the vocabulary is closed.
export const transformers = {
  trim: (value: string) => value.trim(),
  lowercase: (value: string) => value.toLowerCase(),
} as const;

export type TransformerName = keyof typeof transformers;

export type NormalizeConfig = Record<string, TransformerName[]>;

// Applies the configured transformers to each declared field. Other fields
// pass through. For `string[]` fields, each element is transformed individually
// (existential matching in the policy engine works on elements).
function applyChain(value: string, names: TransformerName[]): string {
  let current = value;
  for (const name of names) {
    current = transformers[name](current);
  }
  return current;
}

export function applyNormalize(
  params: Record<string, unknown>,
  config: NormalizeConfig | undefined,
): Record<string, unknown> {
  if (!config) return params;
  const out: Record<string, unknown> = { ...params };
  for (const [field, names] of Object.entries(config)) {
    const value = out[field];
    if (typeof value === 'string') {
      out[field] = applyChain(value, names);
    } else if (Array.isArray(value)) {
      out[field] = value.map((el) => (typeof el === 'string' ? applyChain(el, names) : el));
    }
  }
  return out;
}
