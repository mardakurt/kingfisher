'use client';

/**
 * The rail of the Scoresheet route: the sheet, the entry line, the flags
 * and the game details. The moves it produces go to the analysis store, so
 * the board, the move list and the dock are the workspace's own.
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { createAssistantProvider, AssistantError } from '@/assistant/provider';
import { Button } from '@/components/ui/Button';
import { invalidateGames } from '@/features/persistence/queries';
import { openStoredGame } from '@/features/games/open-game';
import { showTool } from '@/features/workspace/select-tool';
import { importGames } from '@/persistence/import-game';
import { getRepositories } from '@/persistence/repositories';
import { parseReading, SHEET_SYSTEM_PROMPT } from '@/scoresheet/sheet-reading';
import { useAnalysis } from '@/stores/analysis-store';
import { usePreferences } from '@/stores/preferences-store';
import { acceptFlag, candidatesFor, flaggedNodes, useScoresheet } from '@/stores/scoresheet-store';
import { useUi } from '@/stores/ui-store';
import { cn } from '@/lib/cn';

const HEADER_FIELDS: readonly { key: string; label: string; placeholder: string }[] = [
  { key: 'White', label: 'White', placeholder: 'Surname, Forename' },
  { key: 'Black', label: 'Black', placeholder: 'Surname, Forename' },
  { key: 'Event', label: 'Event', placeholder: 'Club championship' },
  { key: 'Round', label: 'Round', placeholder: '3' },
  { key: 'Date', label: 'Date', placeholder: 'YYYY.MM.DD' },
];

const RESULTS = ['*', '1-0', '1/2-1/2', '0-1'] as const;

/** The photo, no larger than a model needs, as a data URL. */
async function photoAsDataUrl(file: File, maxEdge = 1800): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The photo could not be drawn.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function SheetPanel() {
  const photo = useScoresheet((state) => state.photo);
  const gap = useScoresheet((state) => state.gap);
  const reading = useScoresheet((state) => state.reading);
  const setPhoto = useScoresheet((state) => state.setPhoto);
  const enter = useScoresheet((state) => state.enter);
  const takeBack = useScoresheet((state) => state.takeBack);
  const fillGap = useScoresheet((state) => state.fillGap);
  const resolve = useScoresheet((state) => state.resolve);
  const applyTokens = useScoresheet((state) => state.applyTokens);
  const setReading = useScoresheet((state) => state.setReading);
  const tree = useAnalysis((state) => state.tree);
  const currentId = useAnalysis((state) => state.currentId);
  const setHeaderValue = useAnalysis((state) => state.setHeaderValue);
  const goTo = useAnalysis((state) => state.goTo);
  const exportPgn = useAnalysis((state) => state.exportPgn);
  const prefs = usePreferences();
  const notify = useUi((state) => state.notify);
  const openSettingsAt = useUi((state) => state.openSettingsAt);
  const router = useRouter();
  const client = useQueryClient();

  const [text, setText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-read from the tree on every change: the flags live there.
  const flags = flaggedNodes();
  const candidates = candidatesFor(text);
  const plyCount = (() => {
    let count = 0;
    let cursor = tree.nodes[tree.rootId];
    while (cursor?.children[0]) {
      cursor = tree.nodes[cursor.children[0]];
      count += 1;
    }
    return count;
  })();
  const assistantReady = Boolean(prefs.assistantBaseUrl && prefs.assistantModel);

  useEffect(() => () => useScoresheet.getState().reset(), []);

  const submit = (token = text) => {
    if (!token.trim()) return;
    const outcome = enter(token);
    setMessage(outcome);
    setText('');
    inputRef.current?.focus();
  };

  const readSheet = async () => {
    if (!photo) return;
    const provider = createAssistantProvider({
      baseUrl: prefs.assistantBaseUrl,
      model: prefs.assistantModel,
      apiKey: prefs.assistantApiKey,
    });
    if (!provider) {
      setReading({ error: 'Name an assistant endpoint in Settings → Assistant first.' });
      return;
    }
    setReading({ busy: true, error: null, message: `Sending the sheet to ${provider.name}…` });
    try {
      const image = await photoAsDataUrl(photo.file);
      const reply = await provider.ask({
        system: SHEET_SYSTEM_PROMPT,
        user: 'Transcribe this scoresheet. Reply with the JSON object only.',
        images: [image],
      });
      const parsed = parseReading(reply);
      if (parsed.tokens.length === 0) {
        setReading({
          busy: false,
          error: 'The model returned no moves. Type them from the sheet.',
        });
        return;
      }
      for (const [key, value] of Object.entries(parsed.headers)) {
        const header = key[0]!.toUpperCase() + key.slice(1);
        if (!tree.headers[header] || tree.headers[header] === '?') setHeaderValue(header, value);
      }
      const outcome = applyTokens(parsed.tokens, parsed.uncertain);
      const flagged = flaggedNodes().length;
      setReading({
        busy: false,
        message:
          outcome ??
          `${parsed.tokens.length} cells read by ${provider.name}; ${flagged} to check. The model's reading, checked against the rules — not a transcription Kingfisher vouches for.`,
      });
    } catch (error) {
      setReading({
        busy: false,
        error:
          error instanceof AssistantError
            ? `${error.message}${error.remedy ? ` ${error.remedy}` : ''}`
            : error instanceof Error
              ? error.message
              : String(error),
      });
    }
  };

  const save = async (thenAfterRound: boolean) => {
    if (plyCount === 0) return;
    setSaving(true);
    try {
      const repositories = await getRepositories();
      const summary = await importGames(exportPgn(), repositories.games);
      invalidateGames(client);
      if (!summary.firstGame) throw new Error('The game was not stored.');
      notify({
        tone: 'success',
        message:
          summary.imported > 0
            ? 'Saved to My games.'
            : 'This game was already in My games; opened the stored copy.',
        detail: flags.length ? `${flags.length} move(s) still flagged to check.` : undefined,
      });
      await openStoredGame(summary.firstGame.id);
      router.push('/analysis');
      if (thenAfterRound) showTool('/analysis', 'after-round');
    } catch (error) {
      notify({
        tone: 'error',
        message: 'Could not save the game.',
        detail: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto text-xs">
      <section
        className="border-b border-line-subtle p-2"
        data-testid="sheet-photo"
        onDragOver={(event) => {
          if ([...event.dataTransfer.items].some((item) => item.type.startsWith('image/')))
            event.preventDefault();
        }}
        onDrop={(event) => {
          const image = [...event.dataTransfer.files].find((file) =>
            file.type.startsWith('image/'),
          );
          if (!image) return;
          event.preventDefault();
          setPhoto(image);
        }}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-[10px] font-semibold text-tertiary">The sheet</h2>
          {photo ? (
            <div className="flex items-center gap-1">
              <Button variant="ghost" onClick={() => setZoom((z) => Math.max(0.5, z / 1.3))}>
                −
              </Button>
              <Button variant="ghost" onClick={() => setZoom((z) => Math.min(6, z * 1.3))}>
                +
              </Button>
              <Button variant="ghost" onClick={() => setPhoto(null)}>
                Remove
              </Button>
            </div>
          ) : null}
        </div>
        {photo ? (
          <div className="h-56 overflow-auto rounded-[6px] border border-line bg-surface-inset">
            {/* A local object URL of the user's own photo; next/image has nothing to optimise. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={`Scoresheet photo ${photo.name}`}
              style={{ width: `${zoom * 100}%`, maxWidth: 'none' }}
              className="block"
              draggable={false}
            />
          </div>
        ) : (
          <label className="flex h-24 cursor-pointer items-center justify-center rounded-[6px] border border-dashed border-line text-center text-secondary">
            <span>
              Drop a photo of the sheet here, or choose one
              <input
                type="file"
                accept="image/*"
                capture="environment"
                aria-label="Scoresheet photo"
                className="sr-only"
                onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
              />
            </span>
          </label>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            variant="accent"
            disabled={!photo || !assistantReady || reading.busy}
            onClick={() => void readSheet()}
            title={
              assistantReady
                ? 'Send the photo to the assistant endpoint you configured and check every move it reads against the rules'
                : 'Needs an assistant endpoint with a model that can read images (Settings → Assistant)'
            }
          >
            {reading.busy ? 'Reading…' : 'Read the sheet'}
          </Button>
          {!assistantReady ? (
            <button
              type="button"
              className="text-2xs text-tertiary underline"
              onClick={() => openSettingsAt('assistant')}
            >
              Reading a photo needs an assistant endpoint; typing needs nothing.
            </button>
          ) : null}
        </div>
        {reading.message ? (
          <p role="status" className="mt-1 text-2xs text-secondary">
            {reading.message}
          </p>
        ) : null}
        {reading.error ? (
          <p role="alert" className="mt-1 text-2xs text-negative">
            {reading.error}
          </p>
        ) : null}
      </section>

      <section className="border-b border-line-subtle p-2" data-testid="sheet-entry">
        <h2 className="mb-1 text-[10px] font-semibold text-tertiary">
          Enter moves · {plyCount} on the board
        </h2>
        {/*
          Enter takes what was written, never the reading under it: the
          candidate list is a help, and substituting its first entry would
          throw away the doubt the flag list exists to carry. Clicking a
          candidate is the deliberate choice, and enters that move.
        */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            ref={inputRef}
            aria-label="Move as written on the sheet"
            value={text}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
              if (event.key === 'Backspace' && text === '') {
                event.preventDefault();
                takeBack();
                setMessage(null);
              }
            }}
            placeholder={
              gap
                ? 'Next cell after the gap…'
                : 'Nf3, Sf3, 0-0, ed, e8Q — or ? for a cell you cannot read'
            }
            className="h-8 w-full rounded-[6px] border border-line bg-surface-inset px-2 font-mono text-[12px] text-primary outline-none focus:border-accent/60"
          />
        </form>
        {candidates.length && !gap ? (
          <ul className="mt-1 flex flex-wrap gap-1" aria-label="Legal readings">
            {candidates.map((candidate) => (
              <li key={candidate.move.uci}>
                <button
                  type="button"
                  className={cn(
                    'rounded-[5px] border px-1.5 py-0.5 font-mono text-[11px]',
                    candidate.distance === 0
                      ? 'border-accent/60 text-primary'
                      : 'border-line text-secondary',
                  )}
                  onClick={() => submit(candidate.move.san)}
                >
                  {candidate.move.san}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {gap ? (
          <div
            className="mt-1 rounded-[6px] border border-caution/50 bg-caution/10 p-2"
            data-testid="sheet-gap"
          >
            <p className="text-primary">
              Gap open before move {Math.floor((tree.nodes[gap.nodeId]?.ply ?? 0) / 2) + 1}. After
              it: <span className="font-mono">{gap.buffer.join(' ') || '—'}</span>
            </p>
            {gap.reconstruction && gap.reconstruction.survivors.length > 1 ? (
              <ul className="mt-1 flex flex-wrap gap-1" aria-label="Moves that fit the gap">
                {gap.reconstruction.survivors.slice(0, 12).map((candidate) => (
                  <li key={candidate.move.uci}>
                    <button
                      type="button"
                      className="rounded-[5px] border border-line px-1.5 py-0.5 font-mono text-[11px] text-primary"
                      onClick={() => {
                        fillGap(candidate.move.san);
                        setMessage(
                          `Gap filled with ${candidate.move.san}, your choice; flagged to check.`,
                        );
                      }}
                    >
                      {candidate.move.san}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {message ? (
          <p role="status" className="mt-1 text-2xs text-secondary">
            {message}
          </p>
        ) : null}
        <p className="mt-1 text-2xs text-tertiary">
          Enter takes the first reading. Backspace on an empty line takes the last move back.
        </p>
      </section>

      <section className="border-b border-line-subtle p-2" data-testid="sheet-flags">
        <h2 className="mb-1 text-[10px] font-semibold text-tertiary">
          Check these moves · {flags.length}
        </h2>
        {flags.length === 0 ? (
          <p className="text-2xs text-tertiary">
            Nothing flagged. A move the rules could read two ways, or a reader marked, lands here.
          </p>
        ) : (
          <ul className="space-y-1">
            {flags.map((flag) => (
              <li
                key={flag.id}
                className={cn(
                  'rounded-[6px] border p-1.5',
                  flag.id === currentId ? 'border-accent/60' : 'border-line',
                )}
              >
                <button
                  type="button"
                  className="text-left font-mono text-[11px] text-primary"
                  onClick={() => goTo(flag.id)}
                >
                  {Math.floor((flag.ply + 1) / 2)}
                  {flag.ply % 2 === 1 ? '.' : '…'} {flag.san}
                </button>
                <p className="text-2xs text-secondary">{flag.note}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {flag.alternatives.map((alternative) => (
                    <button
                      key={alternative}
                      type="button"
                      className="rounded-[5px] border border-line px-1.5 py-0.5 font-mono text-[11px] text-primary"
                      onClick={() => setMessage(resolve(flag.id, alternative))}
                    >
                      {alternative} instead
                    </button>
                  ))}
                  <button
                    type="button"
                    className="rounded-[5px] border border-line px-1.5 py-0.5 text-[11px] text-secondary"
                    onClick={() => acceptFlag(flag.id)}
                  >
                    It is {flag.san}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="p-2" data-testid="sheet-details">
        <h2 className="mb-1 text-[10px] font-semibold text-tertiary">The game</h2>
        {/* One column in a narrow rail, two where they fit: a name cut to
            "Surname, Forena" is a name nobody can check before saving. */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(118px,1fr))] gap-1">
          {HEADER_FIELDS.map((field) => (
            <label key={field.key} className="text-2xs text-tertiary">
              {field.label}
              <input
                aria-label={field.label}
                value={tree.headers[field.key] === '?' ? '' : (tree.headers[field.key] ?? '')}
                placeholder={field.placeholder}
                onChange={(event) => setHeaderValue(field.key, event.target.value)}
                className="mt-0.5 h-7 w-full rounded-[5px] border border-line bg-surface-inset px-1.5 text-[11px] text-primary"
              />
            </label>
          ))}
          <label className="text-2xs text-tertiary">
            Result
            <select
              aria-label="Result"
              value={tree.headers.Result ?? '*'}
              onChange={(event) => setHeaderValue('Result', event.target.value)}
              className="mt-0.5 h-7 w-full rounded-[5px] border border-line bg-surface-inset px-1.5 text-[11px] text-primary"
            >
              {RESULTS.map((result) => (
                <option key={result} value={result}>
                  {result}
                </option>
              ))}
            </select>
          </label>
        </div>
        {/* Full width and stacked: side by side, the second label ran past
            the rail's edge on a laptop and was clipped. */}
        <div className="mt-2 flex flex-col gap-1.5">
          <Button
            size="sm"
            variant="accent"
            className="w-full"
            disabled={plyCount === 0 || saving || Boolean(gap)}
            onClick={() => void save(true)}
          >
            Save and start After the round
          </Button>
          <Button
            size="sm"
            className="w-full"
            disabled={plyCount === 0 || saving || Boolean(gap)}
            onClick={() => void save(false)}
          >
            Save to My games
          </Button>
        </div>
        {gap ? (
          <p className="mt-1 text-2xs text-caution">Fill the open gap before saving.</p>
        ) : plyCount === 0 ? (
          <p className="mt-1 text-2xs text-tertiary" data-sheet-save-hint>
            Nothing to save yet: enter the moves first.
          </p>
        ) : null}
      </section>
    </div>
  );
}
