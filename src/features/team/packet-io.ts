/**
 * The packet as a file, in a browser.
 *
 * Saving is a download; receiving is a file the person chose. Nothing here
 * decides what is in the packet or what receiving it means — `@/team` does —
 * and the desktop shell needs no bridge for it: a download and a file input
 * are the two file operations every browser already has.
 */

import { plural } from '@/lib/plural';
import { getRepositories } from '@/persistence/repositories';
import {
  buildPacket,
  mergePacket,
  packetFileName,
  parsePacket,
  type MergeSummary,
  type TeamPacket,
} from '@/team';

export async function sharePacket(teamId: string): Promise<{ fileName: string; bytes: number }> {
  const repositories = await getRepositories();
  const team = await repositories.team.getTeam(teamId);
  if (!team) throw new Error('That team no longer exists.');
  const assignments = await repositories.team.listAssignments(teamId);
  const packet = buildPacket(team, assignments);
  const fileName = packetFileName(team, packet.exportedAt);
  const blob = new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  return { fileName, bytes: blob.size };
}

export interface ReceivedPacket {
  readonly teamId: string;
  readonly teamName: string;
  readonly from: string | null;
  readonly summary: MergeSummary;
}

/**
 * Read, check, merge, commit.
 *
 * The merge is computed against what is stored and committed with a revision
 * check; if another tab moved the team in between, it is recomputed once
 * against the live copy — the same rule the preparation mutations apply.
 */
export async function receivePacket(file: File): Promise<ReceivedPacket> {
  let value: unknown;
  try {
    value = JSON.parse(await file.text());
  } catch {
    throw new Error('This file is not JSON.');
  }
  const parsed = parsePacket(value);
  if (!parsed.ok) throw new Error(parsed.reason);
  const repositories = await getRepositories();
  const attempt = async (packet: TeamPacket) => {
    const team = await repositories.team.getTeam(packet.team.id);
    const assignments = team ? await repositories.team.listAssignments(team.id) : [];
    const merged = mergePacket({ team, assignments }, packet);
    await repositories.team.applyMerge(merged.team, merged.assignments);
    return merged;
  };
  let merged;
  try {
    merged = await attempt(parsed.packet);
  } catch (error) {
    if (!(error instanceof Error) || !error.name.startsWith('Stale')) throw error;
    merged = await attempt(parsed.packet);
  }
  return {
    teamId: merged.team.id,
    teamName: merged.team.name,
    from: parsed.packet.exportedBy?.name ?? null,
    summary: merged.summary,
  };
}

export function describeReceipt(received: ReceivedPacket): string {
  const { summary } = received;
  const parts: string[] = [];
  if (summary.teamCreated) parts.push(`joined “${received.teamName}”`);
  if (summary.newMembers > 0) parts.push(plural(summary.newMembers, 'new member'));
  if (summary.newAssignments > 0) parts.push(plural(summary.newAssignments, 'new assignment'));
  if (summary.newHandovers > 0) parts.push(plural(summary.newHandovers, 'new handover'));
  if (parts.length === 0) parts.push('nothing new');
  const from = received.from ? ` from ${received.from}` : '';
  return `Packet received${from}: ${parts.join(', ')}.`;
}
