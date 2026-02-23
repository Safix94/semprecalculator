'use client';

import { useFormattedDate } from '@/hooks/use-formatted-date';
import type { UseFormattedDateOptions } from '@/hooks/use-formatted-date';

interface FormattedDateProps extends UseFormattedDateOptions {
  value: string;
}

export function FormattedDate({ value, locale, dateStyle, timeStyle }: FormattedDateProps) {
  const formatted = useFormattedDate(value, { locale, dateStyle, timeStyle });
  return <time dateTime={value}>{formatted}</time>;
}
