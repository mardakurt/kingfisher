# First-100 — Real Safari certification

Playwright WebKit is not real Safari. WebKit is the engine
underneath Safari, but the application shell is different, and
some browser-shaped features (PWA install, share sheet, print
preview, autofill, file download handling) are different too.

Real Safari must be run by a human, on real macOS, in this
session if possible. If a real Safari session is not possible
in this environment, this file lists the manual checks a
maintainer or a Wave 1 user must run before promoting the
"WebKit is green" automation result to "real Safari is
certified".

## Setup

- [ ] Safari is the default browser, version logged.
- [ ] macOS version logged.
- [ ] Test date logged.
- [ ] A clean profile (no extensions enabled).
- [ ] Kingfisher opened at the canonical landing URL.
- [ ] Safari → Settings → Advanced → "Show full URL" is on,
      so URLs in the address bar are copyable.

## Land

- [ ] Landing renders without missing images.
- [ ] "Open the workspace" link is reachable.
- [ ] The link opens Studio with no console warnings.

## Workspace

- [ ] First-paint of Studio with Starter reference is fast
      enough for a fresh user. Target: under 2 seconds on a
      2020 MacBook.
- [ ] Cmd+K opens the command palette.
- [ ] Cmd+K → "Toggle theme" actually toggles the theme.
- [ ] The board accepts a click-to-move input.
- [ ] Drag-and-drop pieces works.

## Stockfish

- [ ] Cmd+K → "Start engine analysis" begins a search.
- [ ] The eval bar updates within a few seconds.
- [ ] Stopping the engine stops the search and clears the eval
      line.
- [ ] Switching engines via Cmd+K → "Switch to the next engine"
      works.

## Explorer

- [ ] Opening the Explorer on the current position shows the
      Starter summary.
- [ ] A second position loads in under 500 ms after the first.
- [ ] Source picker switches between Starter / Elite OTB if
      Elite is installed.

## Universal Search (Cmd+K)

- [ ] "Report a problem" opens the GitHub bug template.
- [ ] "Report a data issue" opens the GitHub data template.
- [ ] "Send feedback" opens the GitHub feature template.
- [ ] "Open support information" opens Settings → Diagnostics.
- [ ] "Keyboard shortcuts" opens the shortcuts dialog.

## Study create / edit

- [ ] "New study" creates a study, with a chapter.
- [ ] Add a comment (Cmd+K → "Comment on this move…").
- [ ] Header shows the Study-local save indicator ("Saved").
- [ ] Edit the chapter, watch the indicator flip to "Saving…"
      and back to "Saved".

## Autosave

- [ ] Sidebar status reads "Saved on this device".
- [ ] After an edit, sidebar and Study-local indicator agree
      (both "Saving…" simultaneously, both "Saved"
      simultaneously, both "Save failed" simultaneously).
- [ ] Quit Safari, reopen Kingfisher, the chapter is still
      there.

## Backup

- [ ] Settings → Diagnostics → Backup exports a file.
- [ ] The file size is non-zero.
- [ ] The file opens in another tool as JSON.

## Restore

- [ ] Settings → Diagnostics → Restore accepts the export.
- [ ] After restore, an imported study is visible.

## PWA / Add to Dock

- [ ] Safari → File → "Add to Dock" offers the install prompt.
- [ ] After install, the Kingfisher icon launches as a
      stand-alone window.
- [ ] In stand-alone mode, Cmd+K still opens the palette.

## Offline

- [ ] With the network turned off, the previously visited
      routes still load.
- [ ] With the network off, a fresh page load fails with a
      useful error rather than a blank screen.

## Downloads

- [ ] Cmd+K → "Copy PGN to clipboard" copies a non-empty PGN.
- [ ] Cmd+K → "Copy FEN of the current position" copies a
      valid FEN.

## File picker

- [ ] Settings → Database → "Import PGN" opens a file picker.
- [ ] Selecting a PGN imports it.

## Result format

Record in this file, after running the checklist:

- Safari version
- macOS version
- test date
- result (pass / fail / partial)
- any deviations, with rationale

If a real Safari session is not possible in the environment
that ran the gate, mark:

> OWNER MANUAL CHECK REQUIRED

and do not promote the automation result.
