'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { watchDisplacedWork } from './tab-actions';

/** Mounted once, in the shell: see `displacedWork`. Renders nothing. */
export function DisplacedWorkGuard() {
  const router = useRouter();
  useEffect(() => watchDisplacedWork(router), [router]);
  return null;
}
