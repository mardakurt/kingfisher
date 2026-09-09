import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
it.each(['development', 'production'])('uses the documented CSP for %s only', async (mode) => {
  vi.stubEnv('NODE_ENV', mode);
  vi.resetModules();
  const { default: config } = await import('../next.config.ts');
  const headers = await config.headers();
  const csp = headers
    .flatMap((r) => r.headers)
    .find((h) => h.key === 'Content-Security-Policy').value;
  expect(csp.includes("'unsafe-eval'")).toBe(mode === 'development');
  expect(csp).toContain("'wasm-unsafe-eval'");
  expect(csp).toContain("object-src 'none'");
});
