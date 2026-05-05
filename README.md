# pi-side-preview

Right-side file, code, and image preview extension for [pi](https://pi.dev/).

[English](README.md) | [Русский](docs/README.ru.md)

## Features

- Opens text and code files in a right-side overlay preview.
- Keeps pi's input editor usable while the preview is open.
- Syntax highlighting for common file types through pi's Markdown/code renderer.
- Opens images (`png`, `jpg`, `jpeg`, `gif`, `webp`) in a full custom view so terminal inline images can render correctly.
- Remembers preview width/height between openings in the current pi process.
- Resizable preview width and height.
- Mouse wheel scrolling, with a toggle for native terminal text selection.
- Copy visible text or the entire text file to clipboard on macOS via `pbcopy`.
- Configurable open shortcuts and in-preview keys.

## Install

From npm:

```bash
pi install npm:pi-side-preview
```

From GitHub/Git:

```bash
pi install git:github.com/samo33ddd/pi-side-preview
```

With a pinned tag or branch:

```bash
pi install git:github.com/samo33ddd/pi-side-preview@v0.1.0
```

From a local checkout:

```bash
pi install /path/to/pi-side-preview
```

For development/testing without installing:

```bash
pi -e /path/to/pi-side-preview
```

After installing or editing the extension, run:

```text
/reload
```

## Commands

Open a file/image preview:

```text
/side-preview <path>
```

If no path is passed, the extension tries the first line of the clipboard, then asks for a path.

Configure global shortcut(s) used to open/toggle the preview:

```text
/side-preview-bind show
/side-preview-bind reset
/side-preview-bind ctrl+alt+o ctrl+shift+o
```

Changing open shortcuts requires `/reload`.

Configure keys used inside the preview:

```text
/side-preview-keys show
/side-preview-keys reset
/side-preview-keys toggleWheel=ctrl+m copyView=ctrl+y copyAll=ctrl+shift+y widthGrow=alt+left widthShrink=alt+right heightShrink=alt+up heightGrow=alt+down close=escape
```

Reopen the preview to apply in-preview key changes.

## Default shortcuts

Open/toggle preview:

- `Ctrl+Shift+O`
- `Ctrl+Alt+O`

Default preview controls:

- `Ctrl+M`: toggle mouse wheel mode
- `Ctrl+Y`: copy visible view
- `Ctrl+Shift+Y`: copy all text
- `Alt+Left` / `Alt+Right`: resize width
- `Alt+Up` / `Alt+Down`: resize height
- `Esc`: close

## Selection and scrolling

By default, mouse wheel mode is enabled for convenient scrolling. Toggle it with `Ctrl+M`:

- wheel on: scroll the preview with mouse/trackpad wheel;
- wheel off/select: use native terminal mouse selection to copy selected text.

Keyboard copy is also available with `Ctrl+Y` and `Ctrl+Shift+Y` for text files.

## Config

User config is stored at:

```text
~/.pi/agent/side-preview.json
```
