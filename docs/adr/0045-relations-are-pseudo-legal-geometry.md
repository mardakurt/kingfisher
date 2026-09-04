# ADR 0045: Relations are pseudo-legal geometry

## Decision

Relations reports pseudo-legal attack geometry. Pawns attack diagonally;
knights and kings use their geometric steps; bishops, rooks and queens stop at
and include the first occupied square. Side to move, pins and whether moving a
piece would expose its king are ignored.

For an occupied selected square, **attacked by** means opposite-color pieces
whose geometry reaches it, **defended by** means same-color pieces whose
geometry reaches it, and **pieces attacked/defended** partition the occupied
targets reached by the selected piece. An empty square lists every attacker
without inventing a side-relative defence label.

## Why

This answers a factual study question consistently. Legal-move reach would
hide pinned defenders and change with side to move; strategic claims would
turn a deterministic feature into an unproven evaluation.
