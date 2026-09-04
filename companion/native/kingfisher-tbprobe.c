/*
 * Kingfisher's Syzygy probe helper.
 *
 * This file contains **no tablebase decoding**. Every byte of Syzygy format
 * handling is Fathom's (MIT, https://github.com/jdart1/Fathom), fetched and
 * compiled alongside this file by `npm run tablebase:install`. What is here is
 * a FEN parser, a request loop and a JSON writer — the boring parts, which are
 * exactly the parts it is safe to write.
 *
 * The reason for a long-lived process rather than Fathom's own one-shot CLI is
 * `tb_init`: it opens and memory-maps the table files, and a user walking
 * through an endgame would otherwise pay that cost on every single move. So
 * this initialises once, then answers one FEN per line on stdin for as long as
 * the companion keeps it alive.
 *
 * Two rules it holds to:
 *
 *  - **It never guesses.** A position Fathom declines — castling rights
 *    present, too many pieces, a missing table — is reported as unavailable,
 *    with the reason. A wrong tablebase result is worse than no result, because
 *    it is indistinguishable from proof.
 *  - **It computes no chess of its own beyond reading the position.** Moves go
 *    out as UCI with the raw Syzygy values attached; SAN, legality and
 *    perspective are the browser's job, where the rules already live.
 *
 * Protocol, one JSON object per line in each direction:
 *
 *   → (on start)      {"ready":true,"largest":6,"path":"/tables"}
 *   ← <fen>           a FEN, one per line
 *   → {"ok":true,...} or {"ok":false,"reason":"..."}
 *   ← quit            exit cleanly
 */

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "tbprobe.h"

#define MAX_LINE 512

struct position {
  uint64_t white, black, kings, queens, rooks, bishops, knights, pawns;
  unsigned castling;
  unsigned rule50;
  unsigned ep;
  bool turn; /* true = white to move, as Fathom expects */
};

static const char *SQUARE_NAMES[64] = {
    "a1", "b1", "c1", "d1", "e1", "f1", "g1", "h1", "a2", "b2", "c2", "d2", "e2",
    "f2", "g2", "h2", "a3", "b3", "c3", "d3", "e3", "f3", "g3", "h3", "a4", "b4",
    "c4", "d4", "e4", "f4", "g4", "h4", "a5", "b5", "c5", "d5", "e5", "f5", "g5",
    "h5", "a6", "b6", "c6", "d6", "e6", "f6", "g6", "h6", "a7", "b7", "c7", "d7",
    "e7", "f7", "g7", "h7", "a8", "b8", "c8", "d8", "e8", "f8", "g8", "h8"};

/* Fathom's promotion codes, as UCI suffix letters. Index 0 is "no promotion". */
static const char *PROMOTION_LETTERS[5] = {"", "q", "r", "b", "n"};

static int popcount64(uint64_t value) {
  int count = 0;
  while (value) {
    value &= value - 1;
    count += 1;
  }
  return count;
}

/*
 * Parse a FEN into bitboards.
 *
 * Deliberately strict: a field that does not look right is a rejection, not a
 * default. The browser only ever sends FENs it produced itself, so anything
 * malformed here means the two ends disagree about something and the right
 * response is to say so rather than to probe a position nobody asked about.
 */
static bool parse_fen(struct position *pos, const char *fen) {
  memset(pos, 0, sizeof(*pos));
  const char *cursor = fen;

  for (int rank = 7; rank >= 0; rank -= 1) {
    int file = 0;
    while (file < 8) {
      char c = *cursor++;
      if (c == '\0') return false;
      if (c >= '1' && c <= '8') {
        file += c - '0';
        continue;
      }
      if (file > 7) return false;
      uint64_t bit = (uint64_t)1 << (rank * 8 + file);
      switch (c) {
        case 'K': pos->kings |= bit; pos->white |= bit; break;
        case 'k': pos->kings |= bit; pos->black |= bit; break;
        case 'Q': pos->queens |= bit; pos->white |= bit; break;
        case 'q': pos->queens |= bit; pos->black |= bit; break;
        case 'R': pos->rooks |= bit; pos->white |= bit; break;
        case 'r': pos->rooks |= bit; pos->black |= bit; break;
        case 'B': pos->bishops |= bit; pos->white |= bit; break;
        case 'b': pos->bishops |= bit; pos->black |= bit; break;
        case 'N': pos->knights |= bit; pos->white |= bit; break;
        case 'n': pos->knights |= bit; pos->black |= bit; break;
        case 'P': pos->pawns |= bit; pos->white |= bit; break;
        case 'p': pos->pawns |= bit; pos->black |= bit; break;
        default: return false;
      }
      file += 1;
    }
    if (file != 8) return false;
    if (rank > 0) {
      if (*cursor++ != '/') return false;
    }
  }

  if (*cursor++ != ' ') return false;
  char side = *cursor++;
  if (side == 'w') pos->turn = true;
  else if (side == 'b') pos->turn = false;
  else return false;

  if (*cursor++ != ' ') return false;
  if (*cursor == '-') {
    cursor += 1;
  } else {
    while (*cursor && *cursor != ' ') {
      switch (*cursor) {
        case 'K': pos->castling |= TB_CASTLING_K; break;
        case 'Q': pos->castling |= TB_CASTLING_Q; break;
        case 'k': pos->castling |= TB_CASTLING_k; break;
        case 'q': pos->castling |= TB_CASTLING_q; break;
        default: return false;
      }
      cursor += 1;
    }
  }

  if (*cursor++ != ' ') return false;
  if (*cursor == '-') {
    pos->ep = 0;
    cursor += 1;
  } else {
    char file = *cursor++;
    char rank = *cursor++;
    if (file < 'a' || file > 'h' || rank < '1' || rank > '8') return false;
    pos->ep = (unsigned)((rank - '1') * 8 + (file - 'a'));
  }

  /* The halfmove clock is optional; Syzygy needs it for the fifty-move rule. */
  if (*cursor == ' ') {
    cursor += 1;
    pos->rule50 = (unsigned)strtoul(cursor, NULL, 10);
  }
  return true;
}

static void write_uci(char *out, unsigned result) {
  unsigned from = TB_GET_FROM(result);
  unsigned to = TB_GET_TO(result);
  unsigned promotes = TB_GET_PROMOTES(result);
  if (promotes > 4) promotes = 0;
  snprintf(out, 8, "%s%s%s", SQUARE_NAMES[from & 63], SQUARE_NAMES[to & 63],
           PROMOTION_LETTERS[promotes]);
}

static void fail(const char *reason) {
  printf("{\"ok\":false,\"reason\":\"%s\"}\n", reason);
  fflush(stdout);
}

/*
 * Answer one position.
 *
 * `tb_probe_root` is the right entry point rather than `tb_probe_wdl`: it
 * returns the DTZ and a result for every legal move, which is what a board
 * panel needs, and it tolerates a non-zero fifty-move counter, which
 * `tb_probe_wdl` refuses outright.
 */
static void probe(const char *fen) {
  struct position pos;
  if (!parse_fen(&pos, fen)) {
    fail("That FEN could not be read.");
    return;
  }

  int pieces = popcount64(pos.white | pos.black);
  if ((unsigned)pieces > TB_LARGEST) {
    fail("More pieces than the installed tables cover.");
    return;
  }
  /*
   * Fathom refuses any position with castling rights, because Syzygy tables
   * do not model them. Said plainly rather than silently probing without them,
   * which would answer about a different position.
   */
  if (pos.castling != 0) {
    fail("Syzygy tables do not cover positions with castling rights.");
    return;
  }

  unsigned results[TB_MAX_MOVES];
  unsigned result =
      tb_probe_root(pos.white, pos.black, pos.kings, pos.queens, pos.rooks, pos.bishops,
                    pos.knights, pos.pawns, pos.rule50, pos.castling, pos.ep, pos.turn, results);

  if (result == TB_RESULT_FAILED) {
    fail("The table for that material is not present.");
    return;
  }
  if (result == TB_RESULT_CHECKMATE) {
    printf("{\"ok\":true,\"wdl\":0,\"dtz\":0,\"checkmate\":true,\"stalemate\":false,\"moves\":[]}\n");
    fflush(stdout);
    return;
  }
  if (result == TB_RESULT_STALEMATE) {
    printf("{\"ok\":true,\"wdl\":2,\"dtz\":0,\"checkmate\":false,\"stalemate\":true,\"moves\":[]}\n");
    fflush(stdout);
    return;
  }

  printf("{\"ok\":true,\"wdl\":%u,\"dtz\":%u,\"checkmate\":false,\"stalemate\":false,\"moves\":[",
         TB_GET_WDL(result), TB_GET_DTZ(result));

  bool first = true;
  for (unsigned i = 0; i < TB_MAX_MOVES && results[i] != TB_RESULT_FAILED; i += 1) {
    char uci[8];
    write_uci(uci, results[i]);
    printf("%s{\"uci\":\"%s\",\"wdl\":%u,\"dtz\":%u}", first ? "" : ",", uci,
           TB_GET_WDL(results[i]), TB_GET_DTZ(results[i]));
    first = false;
  }
  printf("]}\n");
  fflush(stdout);
}

int main(int argc, char **argv) {
  const char *path = NULL;
  for (int i = 1; i < argc; i += 1) {
    if (strncmp(argv[i], "--path=", 7) == 0) path = argv[i] + 7;
  }
  if (path == NULL || *path == '\0') {
    fprintf(stderr, "usage: kingfisher-tbprobe --path=<syzygy directory>\n");
    return 2;
  }

  if (!tb_init(path)) {
    printf("{\"ready\":false,\"reason\":\"The tablebase directory could not be opened.\"}\n");
    fflush(stdout);
    return 1;
  }

  /*
   * `TB_LARGEST` is zero when the directory holds no readable tables. Reported
   * as ready-with-nothing rather than as a failure: the companion's next step
   * is to tell the user their directory is empty, which is a different message
   * from "the helper will not start".
   */
  printf("{\"ready\":true,\"largest\":%u}\n", TB_LARGEST);
  fflush(stdout);

  char line[MAX_LINE];
  while (fgets(line, sizeof(line), stdin) != NULL) {
    size_t length = strlen(line);
    while (length > 0 && (line[length - 1] == '\n' || line[length - 1] == '\r')) {
      line[--length] = '\0';
    }
    if (length == 0) continue;
    if (strcmp(line, "quit") == 0) break;
    probe(line);
  }

  tb_free();
  return 0;
}
