# SolveIt Drawing Overlay

A drawing overlay for [SolveIt](https://solveit.fast.ai). Click the sparkles
button in the nav bar, sketch on a canvas, and send your drawing straight to the
AI as a prompt or save it as a note. Built on [Fabric.js](http://fabricjs.com/)
for full-featured vector drawing with shapes, text, zoom, and pan.

Three drawing modes are available: **draw** (freehand pencil), **select**
(move/resize/copy objects), and **pan** (scroll around the canvas).

## Features

- **Freehand drawing** — pencil tool with configurable color, thickness, and opacity.
- **Shape tools** — rectangle, circle, triangle, line, arrow, and editable text.
- **Three modes** — draw, select, and pan, toggled via toolbar buttons.
- **Incremental undo/redo** — lightweight action stack (no full-canvas snapshots).
- **Copy/cut/paste objects** — `c`/`x`/`v` keys in select mode.
- **Paste images & SVG** — paste from clipboard directly onto the canvas.
- **Mouse wheel zoom** — zoom toward cursor position.
- **Prompt presets** — split button with preset prompts plus a custom editor.
- **Send modes** — send as prompt & run, prompt only, or note.
- **Bounding-box export** — exported PNG is cropped to drawn content with a small margin.
- **Draggable & resizable** — drag the title bar, resize from the bottom-right corner.
- **Multi-tab canvases** — Excel-style tab strip with rename, close, and dirty indicators.
- **IndexedDB persistence** — save canvases to browser storage with thumbnails.
- **Import canvases** — copy canvases from other dialogs via the `+` menu.
- **Session restore** — remembers which tabs were open and active across page reloads.

## Installation

1. Download or clone this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the extension folder.
5. When you open a SolveIt dialog, the sparkles (✨) button will appear in the nav bar.

## Usage

### Drawing

1. Click the **sparkles button** in the SolveIt nav bar to open the overlay.
2. The default mode is **draw** — start sketching immediately.
3. Use the **toolbar** to change thickness, color, and opacity.
4. Add shapes from the **shape dropdown** — they appear at the canvas center and
   auto-switch to select mode.
5. Use the **mouse wheel** to zoom in/out toward the cursor.

### Select Mode

Switch to select mode to manipulate objects on the canvas.

- **Click** an object to select it; drag to move.
- **Resize/rotate** using the Fabric.js handles.
- **Delete** selected objects with `Delete` or `Backspace`.
- **Copy/cut/paste** with `c`, `x`, `v` keys (no Ctrl needed).
- Successive pastes offset by 15px so objects don't stack.

### Pan Mode

Switch to pan mode to scroll around a large canvas without affecting objects.
Click and drag to pan. The cursor changes to a grab hand.

### Tabs

The tab strip at the bottom of the overlay manages multiple canvases per dialog.

- **Click a tab** to switch canvases. Unsaved changes are kept in memory.
- **Double-click** a tab name to rename it.
- **Click ×** to close a tab (prompts if unsaved). The canvas stays in the DB
  and can be reopened.
- **Click +** to open a menu with:
  - **New blank** — creates a fresh canvas.
  - **Open** — reopen closed canvases for this dialog (with thumbnails). Click 🗑
    to permanently delete.
  - **Import** — copy a canvas from another dialog into the current one.
- **Save button** (floppy icon) saves the active canvas and its thumbnail to
  IndexedDB.
- A `*` after the tab name indicates unsaved changes. Navigating away warns if
  any tab is dirty.

### Sending Drawings

The send split button on the right side of the toolbar controls how drawings are
submitted to SolveIt.

| Mode                     | Description                                                       |
| ------------------------ | ----------------------------------------------------------------- |
| **Send to Prompt & Run** | Creates a prompt message with the drawing and runs it immediately |
| **Send to Prompt**       | Creates a prompt message for you to review before running         |
| **Send to Note**         | Saves the drawing as a note message (no AI interaction)           |

Click the dropdown arrow to switch between modes. The icon color indicates the
current mode: red for prompt modes, green for note.

### Prompt Presets

The speech bubble split button lets you choose what text accompanies the drawing
when sent as a prompt.

- **Click the icon** to open a text editor for custom prompt text.
- **Click the dropdown arrow** to pick from presets like *"Describe this
  drawing"*, *"Solve this"*, *"Convert to text/LaTeX"*, and more.
- Select **Custom…** at the bottom to clear the text and open the editor.

### Overlay Controls

| Action                       | Effect                                 |
| ---------------------------- | -------------------------------------- |
| **Drag title bar**           | Move the overlay (clamped to viewport) |
| **Double-click title bar**   | Snap to fill viewport with 50px margin |
| **Drag bottom-right corner** | Resize the overlay                     |
| **Click ✕**                  | Hide the overlay (state is preserved)  |
| **Click nav button again**   | Show/hide the overlay                  |

## Troubleshooting

**Sparkles button not appearing?**
Make sure you're on a SolveIt dialog page. The extension only activates when it
detects `#dialog-container` in the DOM.

**"Extension context invalidated" error?**
This happens when the extension is reloaded during development while a SolveIt
tab is open. Simply refresh the SolveIt tab.

**Drawing feels laggy on tablet?**
The pencil brush uses `decimate = 2` by default for a good balance of fidelity
and performance. You can adjust this value in `canvas.js`.

**Pasted image too large?**
Images are auto-scaled to fit within 60% of the canvas dimensions. Use select
mode to resize further.

**Can't access overlay after resizing browser?**
Double-click the title bar to snap the overlay back to the viewport center, or
click the nav button to hide and re-show it.

## Contributing

Contributions are welcome! If you find a bug or have a feature idea, please
[open an issue](../../issues). Pull requests are also appreciated — for larger
changes, consider opening an issue first to discuss the approach.

### Project Structure

```
├── manifest.json    # MV3 config: content scripts, web-accessible resources
├── content.js       # ISOLATED world loader — injects modules into MAIN world
├── fabric.min.js    # Bundled Fabric.js (CDN blocked by page CSP)
├── icons.js         # SVG icon definitions (window.DRAWING_ICONS)
├── db.js            # IndexedDB storage — meta + data stores, per-dialog queries
├── canvas.js        # Fabric init, drawing modes, undo/redo, shapes, keyboard/paste, export
├── tabs.js          # Tab strip UI, multi-canvas state, dirty tracking, save/load
├── toolbar.js       # Toolbar DOM construction, dropdowns, button wiring
└── send.js          # Send button, overlay assembly, drag/resize, nav button injection
```

### How It Works

The content script (`content.js`) runs in Chrome's **isolated world** where it
has access to `chrome.runtime.getURL`. It injects the other modules as `<script>`
tags into the page's **main world**, where they can access SolveIt's page globals
(like `_edVar` for the dialog name).

The load order is: `fabric.min.js` → `icons.js` → `db.js` → `canvas.js` →
`tabs.js` → `toolbar.js` → `send.js`. All modules communicate through a shared
state object (`window._drawState`) initialized in `canvas.js`.

Drawings are sent to SolveIt by POSTing to `/upload_attachment_` and
`/update_msg_` — the same internal endpoints the app uses. The browser's session
cookie handles authentication automatically.

The extension re-injects the nav button on HTMX navigation via an
`htmx:afterSettle` listener and a `postMessage('solveit-drawing-reinit')` bridge
between the isolated and main worlds.

### Loading for Development

1. Make your changes.
2. Go to `chrome://extensions` and click the reload button on the extension card.
3. Refresh the SolveIt tab.

### Limitations

- Chrome only — uses Manifest V3 content scripts.
- Fabric.js must be bundled locally because the page's CSP blocks CDN loading.
- Only one overlay instance exists at a time (state is preserved when hidden).
- Undo/redo stack is capped at 50 actions.
- Canvases are stored in the browser's IndexedDB — not synced across devices.