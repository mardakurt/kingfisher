import { flushSync } from 'react-dom';

/** A window command dismisses the focused modal before opening its destination. */
export const MODAL_HANDOFF_EVENT = 'kingfisher:modal-handoff';

export function handOffFocusedModal(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return true;
  const modal = target.closest('[role="dialog"][aria-modal="true"]');
  if (!modal) return true;
  // Local React state and external UI-store writes have different priorities.
  // Finish dismissal/focus restoration before the destination captures focus.
  flushSync(() => modal.dispatchEvent(new Event(MODAL_HANDOFF_EVENT)));
  return !modal.isConnected;
}
