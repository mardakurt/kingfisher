import { beforeEach, expect, it, vi } from 'vitest';
import { parseSingleGame } from '@/chess/pgn';
import { START_FEN } from '@/chess/fen';
import { useAnalysis } from '@/stores/analysis-store';
import { cancelDocumentRequests } from '@/stores/document-request';

const repositories = vi.hoisted(() => ({
  games: { get: vi.fn() },
  analysisQueue: { evidenceForGame: vi.fn(async () => []) },
  linkedAccounts: { list: vi.fn(async () => []) },
  profile: { get: vi.fn(async () => ({ aliases: [] })) },
}));
vi.mock('@/persistence/repositories', () => ({ getRepositories: async () => repositories }));
import { openStoredGame } from './open-game';

function game(id: string, move: string) {
  const parsed = parseSingleGame(
    `[Event "${id}"]\n[White "${id}"]\n[Black "Opponent"]\n[Result "*"]\n\n1. ${move} *`,
  );
  if (!parsed.ok) throw new Error(parsed.error.message);
  return { id, tree: parsed.value.tree, white: id, black: 'Opponent', result: '*' };
}

beforeEach(() => {
  repositories.games.get.mockReset();
  useAnalysis.getState().newGame(START_FEN);
});

it('the last clicked game wins even when the first finishes loading later', async () => {
  let release!: (value: ReturnType<typeof game>) => void;
  repositories.games.get
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValueOnce(game('B', 'd4'));
  const first = openStoredGame('A');
  await vi.waitFor(() => expect(repositories.games.get).toHaveBeenCalledTimes(1));
  const secondOpened = await openStoredGame('B');
  release(game('A', 'e4'));
  const firstOpened = await first;
  expect(useAnalysis.getState().tree.headers.White).toBe('B');
  expect(secondOpened).toBe(true);
  expect(firstOpened).toBe(false);
});

it.each(['edit', 'leave'] as const)('a late game cannot replace work after %s', async (action) => {
  let release!: (value: ReturnType<typeof game>) => void;
  repositories.games.get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = openStoredGame('A');
  await vi.waitFor(() => expect(repositories.games.get).toHaveBeenCalled());
  if (action === 'edit') expect(useAnalysis.getState().playSan('d4').ok).toBe(true);
  else cancelDocumentRequests();
  const tree = useAnalysis.getState().tree;
  release(game('A', 'e4'));
  const opened = await pending;
  expect(useAnalysis.getState().tree).toBe(tree);
  expect(opened).toBe(false);
});

it('an outgoing autosave acknowledgement does not cancel the chosen game', async () => {
  const store = useAnalysis.getState();
  store.openDocument({
    tree: game('Chapter', 'e4').tree,
    document: {
      kind: 'study-chapter',
      title: 'Chapter',
      studyId: 's',
      studyTitle: 'Study',
      chapterId: 'c',
      revision: 1,
    },
  });
  let release!: (value: ReturnType<typeof game>) => void;
  repositories.games.get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = openStoredGame('A');
  await vi.waitFor(() => expect(repositories.games.get).toHaveBeenCalled());
  useAnalysis.getState().setDocumentRevision(2);
  release(game('A', 'd4'));
  expect(await pending).toBe(true);
  expect(useAnalysis.getState().tree.headers.White).toBe('A');
});
