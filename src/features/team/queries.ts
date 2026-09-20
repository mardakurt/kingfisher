/**
 * Query hooks for the team hub.
 *
 * Beside the workspace, like the preparation hooks: these keys are read here
 * and nowhere else.
 */

import { useQuery, type QueryClient } from '@tanstack/react-query';

import type { AssignmentRecord, TeamRecord } from '@/persistence/domain';
import { getRepositories } from '@/persistence/repositories';

export const teamKeys = {
  teams: ['persistence', 'teams'] as const,
  team: (id: string) => ['persistence', 'team', id] as const,
  assignments: (teamId: string) => ['persistence', 'team-assignments', teamId] as const,
};

export function invalidateTeams(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: ['persistence', 'teams'] });
  void client.invalidateQueries({ queryKey: ['persistence', 'team'] });
  void client.invalidateQueries({ queryKey: ['persistence', 'team-assignments'] });
}

export function useTeams() {
  return useQuery<readonly TeamRecord[]>({
    queryKey: teamKeys.teams,
    queryFn: async () => (await getRepositories()).team.listTeams(),
    staleTime: 0,
    retry: false,
  });
}

export function useTeam(id: string | null) {
  return useQuery<TeamRecord | null>({
    queryKey: teamKeys.team(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => (await getRepositories()).team.getTeam(id!),
    staleTime: 0,
    retry: false,
  });
}

export function useAssignments(teamId: string | null) {
  return useQuery<readonly AssignmentRecord[]>({
    queryKey: teamKeys.assignments(teamId ?? ''),
    enabled: Boolean(teamId),
    queryFn: async () => (await getRepositories()).team.listAssignments(teamId!),
    staleTime: 0,
    retry: false,
  });
}
