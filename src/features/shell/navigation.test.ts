import { describe, expect, it } from 'vitest';

import * as icons from '@/components/icons';

import { NAV_GROUPS, NAV_SECTIONS, sectionsInGroup } from './navigation';

/**
 * Navigation is the one list where a duplicate icon is a functional bug rather
 * than an aesthetic one: in the collapsed rail the icon *is* the label, so two
 * sections sharing a shape are two sections a user cannot tell apart. It has
 * happened twice — Openings with Opening Files, Preparation with Endgame — so
 * it is a test rather than a note.
 */
describe('the primary navigation', () => {
  it('gives every section its own icon', () => {
    const byIcon = new Map<unknown, string[]>();
    for (const section of NAV_SECTIONS) {
      const existing = byIcon.get(section.icon);
      if (existing) existing.push(section.id);
      else byIcon.set(section.icon, [section.id]);
    }
    const shared = [...byIcon.values()].filter((sections) => sections.length > 1);
    expect(shared).toEqual([]);
  });

  it('uses icons from the one icon set, not ad-hoc shapes', () => {
    const known = new Set<unknown>(Object.values(icons));
    for (const section of NAV_SECTIONS) {
      expect(known.has(section.icon), `${section.id} uses an icon outside @/components/icons`).toBe(
        true,
      );
    }
  });

  it('puts every section in a declared group, and leaves no group empty', () => {
    const groups = new Set(NAV_GROUPS.map((group) => group.id));
    for (const section of NAV_SECTIONS) expect(groups.has(section.group)).toBe(true);
    for (const group of NAV_GROUPS) expect(sectionsInGroup(group.id).length).toBeGreaterThan(0);
  });

  it('lists the sections of a group in the order the sidebar renders them', () => {
    const flattened = NAV_GROUPS.flatMap((group) => sectionsInGroup(group.id));
    expect(flattened.map((section) => section.id)).toEqual(NAV_SECTIONS.map((s) => s.id));
  });

  it('gives every section a distinct route and a hint that says what it is for', () => {
    const hrefs = NAV_SECTIONS.map((section) => section.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const section of NAV_SECTIONS) {
      expect(section.hint.length).toBeGreaterThan(20);
      expect(section.hint.endsWith('.')).toBe(true);
    }
  });

  it('has no section whose label is a prefix of another, which reads as a duplicate', () => {
    for (const a of NAV_SECTIONS) {
      for (const b of NAV_SECTIONS) {
        if (a.id === b.id) continue;
        expect(a.label).not.toBe(b.label);
      }
    }
  });
});
