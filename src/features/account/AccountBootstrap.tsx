'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { isRemoteQuery, useAccount } from '@/stores/account-store';

/**
 * Starts the account once per page and redraws lists when another device's
 * records land. Renders nothing.
 */
export function AccountBootstrap() {
  const client = useQueryClient();

  useEffect(() => {
    useAccount.getState().init();
  }, []);

  useEffect(() => {
    const onApplied = () => {
      void client.invalidateQueries({ predicate: (query) => !isRemoteQuery(query.queryKey) });
    };
    window.addEventListener('kingfisher:cloud-applied', onApplied);
    return () => window.removeEventListener('kingfisher:cloud-applied', onApplied);
  }, [client]);

  return null;
}
