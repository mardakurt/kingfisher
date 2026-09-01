'use client';

/**
 * The companion connection for this browser session.
 *
 * A module-level singleton rather than React state, because the engine
 * providers are constructed outside React and must be able to reach it. The
 * configuration itself is persisted in preferences; this is only the live
 * client built from it.
 */

import { CompanionClient, type CompanionConfig } from './client';

let current: CompanionClient | null = null;
let config: CompanionConfig | null = null;

export function setCompanion(next: CompanionConfig | null): void {
  config = next;
  current = next ? new CompanionClient(next) : null;
}

export const companionClient = (): CompanionClient | null => current;
export const companionConfig = (): CompanionConfig | null => config;
export const companionConfigured = (): boolean => current !== null;
