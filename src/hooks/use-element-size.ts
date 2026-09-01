'use client';

import { useEffect, useState, type RefObject } from 'react';

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Observe an element's box.
 *
 * The board has to be square and as large as the space allows, which CSS alone
 * cannot express when the limiting dimension changes between width and height.
 * Measuring is the honest solution.
 */
export function useElementSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((current) =>
        Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5
          ? current
          : { width, height },
      );
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
