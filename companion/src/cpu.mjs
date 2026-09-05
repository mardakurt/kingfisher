import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Unknown capabilities are not consent to execute a specialized binary. */
export function cpuFeatures(platform = process.platform, arch = process.arch) {
  if (arch === 'arm64') return ['neon'];
  try {
    const raw =
      platform === 'linux'
        ? readFileSync('/proc/cpuinfo', 'utf8')
        : platform === 'darwin'
          ? execFileSync('sysctl', ['-n', 'machdep.cpu.features', 'machdep.cpu.leaf7_features'], {
              encoding: 'utf8',
              timeout: 2000,
            })
          : '';
    const flags = new Set(raw.toLowerCase().replaceAll('.', '_').split(/\s+/));
    return ['avx2', 'bmi2', 'fma', 'sse4_2', 'popcnt'].filter((flag) => flags.has(flag));
  } catch {
    return [];
  }
}

export function compatibleAsset(entry, platform, features) {
  const asset = entry.assets?.[platform];
  if (!asset) return null;
  const candidates = [...(asset.alternatives ?? []), asset];
  return (
    candidates.find((candidate) =>
      (candidate.requires ?? []).every((flag) => features.includes(flag)),
    ) ?? null
  );
}
