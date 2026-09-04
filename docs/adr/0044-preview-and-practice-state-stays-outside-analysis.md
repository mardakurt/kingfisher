# ADR 0044: Preview and practice state stays outside Analysis

## Decision

PV preview and Play From Here keep their temporary cursor and positions in
feature-local state. They replay moves through the domain `Position` and render
through shared board layers, but do not write the analysis tree while the user
is inspecting or practising.

The only handoff is explicit: **Analyze after** creates an analysis rooted at
the practice start FEN and inserts the recorded legal UCI line. PV preview has
no write action at all; the existing Insert action remains separate.

## Why

The main board is the authoritative document cursor. Moving it merely because
a pointer crossed an engine line makes inspection destructive and breaks the
player's place in the tree. Practice is likewise disposable until the player
chooses to retain it. A separate renderer would avoid writes but create board
drift, so both features reuse the canonical rules and rendering boundaries.
