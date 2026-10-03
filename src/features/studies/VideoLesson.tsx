'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Panel, PanelBody } from '@/components/ui/Panel';
import {
  clearVideoLesson,
  setVideoCue,
  validVideoTime,
  VIDEO_FILENAME_HEADER,
  videoCues,
  videoNodeAt,
} from '@/chess/tree/video-cues';
import { useAnalysis } from '@/stores/analysis-store';

const timestamp = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
};

/** The same study tree and board; the video carries no second chess state. */
export function VideoLesson({ chapterId }: { readonly chapterId: string }) {
  const tree = useAnalysis((state) => state.tree);
  const currentId = useAnalysis((state) => state.currentId);
  const document = useAnalysis((state) => state.document);
  const applyEdit = useAnalysis((state) => state.applyEdit);
  const goTo = useAnalysis((state) => state.goTo);
  const video = useRef<HTMLVideoElement>(null);
  const [media, setMedia] = useState<{ name: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [seconds, setSeconds] = useState('0');
  const [duration, setDuration] = useState<number | null>(null);
  const cues = useMemo(() => videoCues(tree), [tree]);
  const filename = tree.headers[VIDEO_FILENAME_HEADER];
  const ownsBoard = document.kind === 'study-chapter' && document.chapterId === chapterId;
  const cueTime = Number(seconds);
  const validTime =
    seconds.trim() !== '' && validVideoTime(cueTime) && (duration === null || cueTime <= duration);

  useEffect(() => {
    if (!media) return;
    return () => URL.revokeObjectURL(media.url);
  }, [media]);
  useEffect(() => {
    if (!ownsBoard) video.current?.pause();
  }, [ownsBoard]);

  const followTime = (time: number) => {
    if (!ownsBoard || !follow) return;
    const id = videoNodeAt(tree, time, cues);
    if (id !== currentId) goTo(id);
  };

  return (
    <div data-video-lesson className="flex h-full min-h-0 flex-col">
      <Panel className="flex-1">
        <PanelBody className="space-y-3 px-3 py-3">
          <details className="text-2xs text-secondary">
            <summary className="cursor-pointer text-primary">About local video lessons</summary>
            <p className="mt-2">
              Choose a local video you own. Add timed cues to this chapter’s moves; playback follows
              them on the board. The filename and cues are saved and included in PGN and backups.
              The video stays on your device; choose it again after reopening the lesson.
            </p>
          </details>
          <label className="block space-y-1 text-2xs text-secondary">
            {media
              ? `Attached ${media.name}`
              : filename
                ? `Attach ${filename}`
                : 'Choose lesson video'}
            <input
              type="file"
              accept="video/*,.mp4,.webm,.mov,.m4v"
              aria-label="Choose lesson video"
              disabled={!ownsBoard}
              className="block w-full min-w-0 text-2xs file:mr-2 file:rounded file:border file:border-line file:bg-surface-2 file:px-2 file:py-1 file:text-primary"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|m4v)$/i.test(file.name)) {
                  setError('Choose a video file (MP4, WebM, MOV or M4V).');
                  return;
                }
                if (filename && filename !== file.name) {
                  setError(
                    `This chapter uses ${filename}. Choose that file, or clear the lesson before replacing it.`,
                  );
                  return;
                }
                setError(null);
                setDuration(null);
                setMedia({ name: file.name, url: URL.createObjectURL(file) });
                if (!filename)
                  applyEdit((value) => ({
                    ...value,
                    headers: { ...value.headers, [VIDEO_FILENAME_HEADER]: file.name },
                  }));
              }}
            />
          </label>
          {media ? (
            <video
              ref={video}
              src={media.url}
              aria-label="Lesson video"
              controls
              playsInline
              preload="metadata"
              className="aspect-video w-full rounded-[var(--radius-control)] bg-black"
              onLoadedMetadata={(event) => {
                const length = event.currentTarget.duration;
                setDuration(Number.isFinite(length) ? length : null);
              }}
              onTimeUpdate={(event) => followTime(event.currentTarget.currentTime)}
              onSeeked={(event) => followTime(event.currentTarget.currentTime)}
              onError={() =>
                setError(
                  'This video could not be played. Try MP4 (H.264) or WebM supported by your browser.',
                )
              }
            />
          ) : null}
          {error ? (
            <p role="alert" className="text-2xs text-danger">
              {error}
            </p>
          ) : null}
          <label className="flex items-center gap-2 text-2xs text-secondary">
            <input
              type="checkbox"
              checked={follow}
              onChange={(event) => {
                setFollow(event.target.checked);
                if (event.target.checked && video.current && ownsBoard) {
                  goTo(videoNodeAt(tree, video.current.currentTime, cues));
                }
              }}
            />
            Follow video on the board
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-2xs text-secondary">
              Cue time (seconds)
              <input
                type="number"
                min="0"
                max={duration ?? 86_400}
                step="0.1"
                value={seconds}
                onChange={(event) => setSeconds(event.target.value)}
                className="mt-1 block h-7 w-24 rounded border border-line bg-surface-inset px-2 text-primary"
              />
            </label>
            <Button
              size="sm"
              disabled={!media}
              onClick={() =>
                setSeconds(String(Math.round((video.current?.currentTime ?? 0) * 10) / 10))
              }
            >
              Use video time
            </Button>
            <Button
              size="sm"
              disabled={!ownsBoard || !filename || !validTime}
              onClick={() => applyEdit((value) => setVideoCue(value, currentId, cueTime))}
            >
              Cue current position
            </Button>
          </div>
          {!validTime ? (
            <p role="alert" className="text-2xs text-danger">
              Enter a time within this video (up to 24 hours).
            </p>
          ) : null}
          {cues.length ? (
            <ol aria-label="Video cues" className="space-y-1">
              {cues.map((cue) => (
                <li key={cue.nodeId} className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!ownsBoard}
                    className="min-w-0 flex-1 rounded px-2 py-1 text-left text-2xs text-primary hover:bg-surface-2"
                    aria-current={cue.nodeId === currentId ? 'true' : undefined}
                    aria-label={`Jump to ${timestamp(cue.seconds)} ${cue.label}`}
                    onClick={() => {
                      goTo(cue.nodeId);
                      if (video.current) video.current.currentTime = cue.seconds;
                    }}
                  >
                    <span className="mr-2 text-secondary tabular">{timestamp(cue.seconds)}</span>
                    {cue.label}
                  </button>
                  <Button
                    size="sm"
                    disabled={!ownsBoard}
                    aria-label={`Remove cue for ${cue.label}`}
                    onClick={() => applyEdit((value) => setVideoCue(value, cue.nodeId, null))}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-2xs text-tertiary">
              Select a move, then cue its position at the time it appears in the video.
            </p>
          )}
          {filename ? (
            <Button
              size="sm"
              disabled={!ownsBoard}
              onClick={() => {
                video.current?.pause();
                setMedia(null);
                setError(null);
                setDuration(null);
                applyEdit(clearVideoLesson);
              }}
            >
              Clear lesson and cues
            </Button>
          ) : null}
        </PanelBody>
      </Panel>
    </div>
  );
}
