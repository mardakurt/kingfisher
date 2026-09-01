/**
 * Which engines this build knows about.
 *
 * Adding Leela, a native bridge or a remote analysis server means adding a
 * provider here; nothing in the UI changes.
 */

import { StockfishWasmProvider } from './stockfish/provider';
import type { EngineProvider } from './types';

const providers: EngineProvider[] = [new StockfishWasmProvider()];

export const engineProviders = (): readonly EngineProvider[] => providers;

export const defaultEngineProvider = (): EngineProvider => providers[0] as EngineProvider;

export const engineProviderById = (id: string): EngineProvider | undefined =>
  providers.find((provider) => provider.id === id);
