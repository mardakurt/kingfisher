import { parseFen } from './fen';
import { relationsFor } from './relations';

const parts = (fen: string) => {
  const parsed = parseFen(fen);
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
};

describe('attack and defence relations', () => {
  it('uses pseudo-legal geometry and stops sliders at the first piece', () => {
    const relations = relationsFor(parts('4k3/8/8/3p4/2B1P3/8/8/4K3 w - - 0 1'), 'd5');
    expect(relations.attackedBy).toEqual(['c4', 'e4']);
    expect(relations.defendedBy).toEqual([]);
  });

  it('separates a piece targets from its defenders and attackers', () => {
    const relations = relationsFor(parts('4k3/8/1n6/3p4/2B5/4N3/4P3/4K3 w - - 0 1'), 'c4');
    expect(relations.piecesAttacked).toContain('d5');
    expect(relations.piecesDefended).toContain('e2');
    expect(relations.attackedBy).toContain('b6');
    expect(relations.defendedBy).toContain('e3');
  });

  it('reports every geometric attacker of an empty square', () => {
    const relations = relationsFor(parts('4k3/2n5/8/8/2B5/8/8/4K3 w - - 0 1'), 'd5');
    expect(relations.piece).toBeNull();
    expect(relations.attackedBy).toEqual(expect.arrayContaining(['c4', 'c7']));
  });
});
