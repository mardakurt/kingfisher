// GENERATED from src/search/route.ts by `npm run companion:shared`. Do not edit.
/**
 * A piece's route: `N f3 d2 f1 g3`, as ChessBase's manoeuvre search asks it.
 *
 * A route matches when one piece of the named type makes exactly these moves,
 * in order. Other pieces may move in between, and the piece may wait, but it
 * may not make any other move in the middle of the route. It is followed by
 * the square it stands on, so anything that removes it from that square —
 * a capture there, an en-passant capture of it, a promotion — ends the trail.
 * Castling moves the rook as well as the king, and the rook is followed too.
 *
 * Pure. Reads each move's origin piece from the FEN before it, counting
 * characters rather than running the validating parser, because a search
 * calls this for every move of every game it reads.
 */

                                           

                                                           

                        
                             
                                      
                                                 
                         
 

                        
                                                                                                

/**
 * One move of the line. Either the position before it (`fenBefore`), from
 * which the mover and the target square are read, or — for a reader that
 * keeps no FENs, like the companion's compact line index — the mover and
 * whether the target square was occupied, given directly. Both describe the
 * same move; `findRoute` reads whichever it is handed.
 */
                         
                       
                       
     
                                  
     
                                                                                  
                                       
     
  

export function parseRoute(text        )             {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Type a piece and its squares, e.g. "N f3 d2 f1".' };
  // "b1" is a square, not a bishop: a piece letter is never followed by a rank.
  const letter = /^([KQRBNP])(?![1-8])/i.exec(trimmed)?.[1];
  if (!letter) {
    return { ok: false, error: 'Start with the piece: K, Q, R, B, N or P, e.g. "N f3 d2 f1".' };
  }
  const squares = [
    ...trimmed
      .slice(1)
      .toLowerCase()
      .matchAll(/[a-h][1-8]/g),
  ].map((m) => m[0]);
  // Anything that is not a square, a separator or a repeated piece letter is a typo worth naming.
  const leftover = trimmed
    .slice(1)
    .toLowerCase()
    .replace(/[a-h][1-8]/g, '')
    .replace(/[\s\-–—,>]+/g, '')
    .replace(new RegExp(letter.toLowerCase(), 'g'), '');
  if (leftover) return { ok: false, error: `"${leftover}" is not a square.` };
  if (squares.length < 2) {
    return { ok: false, error: 'A route needs at least two squares, e.g. "N f3 d2".' };
  }
  for (let index = 1; index < squares.length; index += 1) {
    if (squares[index] === squares[index - 1]) {
      return { ok: false, error: `${squares[index]} follows itself; a move goes somewhere.` };
    }
  }
  const piece = letter.toLowerCase()              ;
  return {
    ok: true,
    route: { piece, squares, label: `${letter.toUpperCase()} ${squares.join('–')}` },
  };
}

                 
                 
                                                                  
                  
 

/**
 * The ply at which the route is completed, or null.
 *
 * `colour` restricts the piece to one side; without it, either side's piece
 * can walk the route.
 */
export function findRoute(
  moves                      ,
  route       ,
  colour        ,
)                {
  let trails          = [];
  const last = route.squares.length - 1;
  for (const move of moves) {
    const from = move.uci.slice(0, 2);
    const to = move.uci.slice(2, 4);
    const promotion = move.uci.length > 4;
    const mover = 'fenBefore' in move ? pieceOn(move.fenBefore, from) : move.mover;
    if (!mover) continue;
    const targetOccupied =
      'fenBefore' in move ? pieceOn(move.fenBefore, to) !== null : move.targetOccupied;

    // Squares this move empties of a piece that is not the mover.
    const removed = new Set        ([to]);
    if (mover.type === 'p' && from[0] !== to[0] && !targetOccupied) {
      removed.add(`${to[0]}${from[1]}`); // en passant
    }
    // Castling: the rook travels too.
    let rookFrom                = null;
    let rookTo                = null;
    if (mover.type === 'k' && Math.abs(file(from) - file(to)) === 2) {
      const rank = from[1];
      rookFrom = `${file(to) > file(from) ? 'h' : 'a'}${rank}`;
      rookTo = `${file(to) > file(from) ? 'f' : 'd'}${rank}`;
    }

    const next          = [];
    for (const trail of trails) {
      if (trail.square === from) {
        // The followed piece moved: onward along the route, or the trail ends.
        if (!promotion && to === route.squares[trail.reached + 1]) {
          if (trail.reached + 1 === last) return move.ply;
          next.push({ square: to, reached: trail.reached + 1 });
        }
        continue;
      }
      if (rookFrom && trail.square === rookFrom) {
        if (rookTo === route.squares[trail.reached + 1]) {
          if (trail.reached + 1 === last) return move.ply;
          next.push({ square: rookTo, reached: trail.reached + 1 });
        }
        continue;
      }
      if (removed.has(trail.square)) continue; // captured
      next.push(trail);
    }
    trails = next;

    // A new trail starts when the right piece takes the route's first step.
    const colourOk = !colour || mover.color === colour;
    if (colourOk && mover.type === route.piece && from === route.squares[0]) {
      if (!promotion && to === route.squares[1]) {
        if (last === 1) return move.ply;
        trails.push({ square: to, reached: 1 });
      }
    }
    if (
      colourOk &&
      route.piece === 'r' &&
      rookFrom === route.squares[0] &&
      rookTo === route.squares[1]
    ) {
      if (last === 1) return move.ply;
      trails.push({ square: rookTo, reached: 1 });
    }
  }
  return null;
}

const file = (square        )         => square.charCodeAt(0) - 97;

/** The piece on a square, read from the FEN's placement field. */
export function pieceOn(
  fen        ,
  square        ,
)                                                              {
  const targetFile = file(square);
  const targetRank = Number(square[1]);
  let rank = 8;
  let column = 0;
  for (let index = 0; index < fen.length; index += 1) {
    const char = fen[index] ;
    if (char === ' ') break;
    if (char === '/') {
      rank -= 1;
      column = 0;
      continue;
    }
    if (char >= '1' && char <= '8') {
      column += Number(char);
      continue;
    }
    if (rank === targetRank && column === targetFile) {
      const lower = char.toLowerCase();
      return { color: char === lower ? 'b' : 'w', type: lower               };
    }
    column += 1;
  }
  return null;
}
