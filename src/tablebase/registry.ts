import { LichessTablebaseProvider } from './lichess';
import type { TablebaseProvider } from './types';

const providers: TablebaseProvider[] = [new LichessTablebaseProvider()];

export const tablebaseProviders = (): readonly TablebaseProvider[] => providers;
export const defaultTablebaseProvider = (): TablebaseProvider => providers[0] as TablebaseProvider;
