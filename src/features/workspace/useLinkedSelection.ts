'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

/** A new deep link takes effect even when its workspace is already mounted. */
export function useLinkedSelection(parameter: string, initial: string | null = null) {
  const params = useSearchParams();
  const requested = params.get(parameter);
  const [seen, setSeen] = useState(requested);
  const [selected, setSelected] = useState<string | null>(requested ?? initial);
  if (seen !== requested) {
    setSeen(requested);
    setSelected(requested ?? initial);
  }
  return [selected, setSelected] as const;
}
