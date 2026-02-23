'use client';

import { useSyncExternalStore } from 'react';

type DateStyle = 'short' | 'medium' | 'long';
type TimeStyle = 'short' | 'medium';

export interface UseFormattedDateOptions {
  locale?: string;
  dateStyle?: DateStyle;
  timeStyle?: TimeStyle;
}

function subscribe() {
  return () => {};
}

function formatIsoDate(
  isoString: string,
  locale: string,
  dateStyle?: DateStyle,
  timeStyle?: TimeStyle
) {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return isoString;
  }

  const formatOptions: Intl.DateTimeFormatOptions = {};

  if (dateStyle) {
    formatOptions.dateStyle = dateStyle;
  }

  if (timeStyle) {
    formatOptions.timeStyle = timeStyle;
  }

  return Object.keys(formatOptions).length > 0
    ? parsed.toLocaleString(locale, formatOptions)
    : parsed.toLocaleString(locale);
}

export function useFormattedDate(isoString: string, options?: UseFormattedDateOptions) {
  const locale = options?.locale ?? 'nl-NL';
  const dateStyle = options?.dateStyle;
  const timeStyle = options?.timeStyle;
  const isHydrated = useSyncExternalStore(subscribe, () => true, () => false);

  if (!isHydrated) {
    return isoString;
  }

  return formatIsoDate(isoString, locale, dateStyle, timeStyle);
}
