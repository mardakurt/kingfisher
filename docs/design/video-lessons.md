# Local video lessons

Studies → choose a chapter → **Video lesson**. Attach a video file, select a
position on the board, enter its time in seconds (or use the video's current
time), then **Cue current position**. Adding a cue at an occupied time replaces
the old cue for that time. Positions in variations and the start are supported.

Play or seek in the native video controls to follow the timed positions.
Uncheck **Follow video on the board** to explore independently; check it again
to return to the video's position. Clicking a cue seeks the video and board.
Remove a cue individually or clear the lesson and all cues. Tree edits can be
undone through the ordinary study undo path.

The filename is saved as `KFVideoFilename` in the chapter tree's headers; each
cue is `NodeMeta.videoSeconds`, exported as `[%kfvideo seconds]`. Times are
finite, non-negative and at most 24 hours. The chapter's existing autosave,
revision conflict check and portable store carry this work. Video playback
only navigates the tree; it does not mark the lesson edited.

A chosen file creates a temporary `blob:` URL, revoked on replacement or
unmount. No remote media address, arbitrary native path or upload is offered.
The CSP admits local blob media. A new chapter detaches the previous video's
handle; switching documents pauses it. Reopening requires selecting the file
again. A different filename is refused until the old lesson is cleared.

This requires a video the user has the right to use and a codec their browser
can decode. MP4/H.264 and WebM are common choices. Kingfisher does not distribute
video courses or read proprietary Fritztrainer packages.
