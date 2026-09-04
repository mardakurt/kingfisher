import { GENERIC_ICON_GALLERY } from './IconGallery';

describe('icon gallery registry', () => {
  it('gives every generic action a unique label and one component', () => {
    const labels = GENERIC_ICON_GALLERY.map((entry) => entry.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(GENERIC_ICON_GALLERY.every((entry) => typeof entry.icon === 'function')).toBe(true);
  });
});
