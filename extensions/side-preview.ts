import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Image, Markdown, matchesKey, Key, truncateToWidth, visibleWidth, type Component } from "@mariozechner/pi-tui";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, basename, extname, dirname } from "node:path";
import { homedir } from "node:os";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CONFIG_PATH = resolve(homedir(), ".pi/agent/side-preview.json");
const LEGACY_CONFIG_PATH = resolve(homedir(), ".pi/agent/markdown-side-preview.json");
const DEFAULT_SHORTCUTS = ["ctrl+shift+o", "ctrl+alt+o"];

type OverlayKeys = {
  toggleWheel: string;
  copyView: string;
  copyAll: string;
  widthGrow: string;
  widthShrink: string;
  heightShrink: string;
  heightGrow: string;
  close: string[];
};

type PluginConfig = {
  shortcuts?: string[];
  keys?: Partial<OverlayKeys>;
};

const DEFAULT_KEYS: OverlayKeys = {
  toggleWheel: "ctrl+m",
  copyView: "ctrl+y",
  copyAll: "ctrl+shift+y",
  widthGrow: "alt+left",
  widthShrink: "alt+right",
  heightShrink: "alt+up",
  heightGrow: "alt+down",
  close: ["escape"],
};

function loadConfig(): PluginConfig {
  for (const path of [CONFIG_PATH, LEGACY_CONFIG_PATH]) {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as PluginConfig;
    } catch {}
  }
  return {};
}

function saveConfig(config: PluginConfig): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function getConfiguredShortcuts(): string[] {
  const shortcuts = loadConfig().shortcuts?.map((s) => s.trim()).filter(Boolean) ?? DEFAULT_SHORTCUTS;
  return [...new Set(shortcuts)];
}

function getOverlayKeys(): OverlayKeys {
  const keys = loadConfig().keys ?? {};
  return {
    ...DEFAULT_KEYS,
    ...keys,
    close: keys.close?.length ? keys.close : DEFAULT_KEYS.close,
  };
}

function keyLabel(key: string): string {
  const labels: Record<string, string> = {
    escape: "Esc",
    left: "←",
    right: "→",
    up: "↑",
    down: "↓",
    shift: "Shift",
    ctrl: "Ctrl",
    alt: "Alt",
    super: process.platform === "darwin" ? "Cmd" : "Super",
  };
  if (key === "shift+y") return "Shift+Y";
  return key
    .split("+")
    .map((part) => labels[part] ?? (part.length === 1 ? part.toUpperCase() : part[0]!.toUpperCase() + part.slice(1)))
    .join("+");
}

function matchesConfiguredKey(data: string, key: string): boolean {
  return matchesKey(data, key) || (key === "shift+y" && matchesKey(data, "Y"));
}

function matchesAnyConfiguredKey(data: string, keys: string[]): boolean {
  return keys.some((key) => matchesConfiguredKey(data, key));
}

let activePreviewClose: (() => void) | undefined;
let rememberedWidthPercent = 38;
let rememberedHeightRows: number | undefined;
let rememberedBottomMarginRows = 7;

function setMouseWheelReporting(enabled: boolean): void {
  // X10/normal mouse + SGR extended coordinates. Wheel events arrive as ESC[<64;X;YM / ESC[<65;X;YM.
  process.stdout.write(enabled ? "\x1b[?1000h\x1b[?1006h" : "\x1b[?1000l\x1b[?1006l");
}

function parseMouseWheel(data: string): "up" | "down" | undefined {
  const match = data.match(/^\x1b\[<(\d+);\d+;\d+[mM]$/);
  if (!match) return undefined;
  const button = Number(match[1]);
  if ((button & 64) === 0) return undefined;
  const direction = button & 3;
  if (direction === 0) return "up";
  if (direction === 1) return "down";
  return undefined;
}

function stripAnsi(input: string): string {
  return input
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b_G[^\x1b]*(?:\x1b\\)/g, "");
}

function copyToClipboard(text: string): void {
  execFileSync("pbcopy", [], { input: text });
}

function padToWidth(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

function threeColumnLine(left: string, center: string, right: string, width: number): string {
  const w = Math.max(1, width);
  const l = truncateToWidth(left, Math.floor(w / 3), "");
  const r = truncateToWidth(right, Math.floor(w / 3), "");
  const leftWidth = visibleWidth(l);
  const rightWidth = visibleWidth(r);
  const centerWidth = Math.max(0, w - leftWidth - rightWidth - 2);
  const c = truncateToWidth(center, centerWidth, "");
  const cWidth = visibleWidth(c);
  const innerSpace = Math.max(0, w - leftWidth - rightWidth - cWidth);
  const leftGap = Math.floor(innerSpace / 2);
  const rightGap = innerSpace - leftGap;
  return truncateToWidth(padToWidth(l + " ".repeat(leftGap) + c + " ".repeat(rightGap) + r, w), w, "");
}

function fixedThreeColumnLine(left: string, center: string, right: string, width: number): string {
  const w = Math.max(1, width);
  const colWidth = Math.max(1, Math.floor(w / 3));
  const l = truncateToWidth(left, colWidth, "");
  const c = truncateToWidth(center, colWidth, "");
  const r = truncateToWidth(right, colWidth, "");
  const leftWidth = visibleWidth(l);
  const centerWidth = visibleWidth(c);
  const rightWidth = visibleWidth(r);
  const centerStart = Math.max(leftWidth + 1, Math.floor((w - centerWidth) / 2));
  const rightStart = Math.max(centerStart + centerWidth + 1, w - rightWidth);
  let line = l;
  line += " ".repeat(Math.max(0, centerStart - visibleWidth(line)));
  line += c;
  line += " ".repeat(Math.max(0, rightStart - visibleWidth(line)));
  line += r;
  return truncateToWidth(padToWidth(line, w), w, "");
}

const ansi = {
  reset: "\x1b[0m",
  bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
  dim: (text: string) => `\x1b[2m${text}\x1b[22m`,
  inverse: (text: string) => `\x1b[7m${text}\x1b[27m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[39m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[39m`,
  green: (text: string) => `\x1b[32m${text}\x1b[39m`,
  blue: (text: string) => `\x1b[34m${text}\x1b[39m`,
};

class SidePreview implements Component {
  private scroll = 0;
  private visiblePlainText = "";

  constructor(
    private title: string,
    private body: Component,
    private close: () => void,
    private getRows: () => number,
    private plainText?: string,
    private resizeWidth?: (deltaPercent: number) => void,
    private resizeHeight?: (deltaRows: number) => void,
    private toggleMouseWheel?: () => void,
    private isMouseWheelEnabled?: () => boolean,
    private keys: OverlayKeys = getOverlayKeys(),
  ) {}

  render(width: number): string[] {
    const w = Math.max(1, width);
    const maxRows = Math.max(10, Math.floor(this.getRows()));
    const chromeRows = 6;
    const bodyRows = Math.max(1, maxRows - chromeRows);
    const body = this.body.render(width);
    const maxScroll = Math.max(0, body.length - bodyRows);
    this.scroll = Math.max(0, Math.min(this.scroll, maxScroll));

    const title = ansi.bold(ansi.cyan(this.title));
    const closeLabel = `${this.keys.close.map(keyLabel).join("/")} close`;
    const top = threeColumnLine(ansi.dim("Preview:"), title, ansi.yellow(closeLabel), w);
    const sep = ansi.dim("─".repeat(w));
    const visibleBody = body.slice(this.scroll, this.scroll + bodyRows);
    this.visiblePlainText = stripAnsi(visibleBody.join("\n"));
    while (visibleBody.length < bodyRows) visibleBody.push("");

    const wheelEnabled = this.isMouseWheelEnabled?.() ?? false;
    const wheelState = wheelEnabled ? ansi.green("on") : ansi.yellow("off/select");
    const range = ansi.dim(`${this.scroll + 1}-${Math.min(body.length, this.scroll + bodyRows)}/${body.length}`);
    const footer1 = fixedThreeColumnLine(
      `${ansi.bold(keyLabel(this.keys.toggleWheel))} wheel:${wheelState}`,
      `${ansi.bold(keyLabel(this.keys.copyView))} copy-view`,
      `${ansi.bold(keyLabel(this.keys.copyAll))} copy-all`,
      w,
    );
    const footer2 = fixedThreeColumnLine(
      `${ansi.bold(`${keyLabel(this.keys.widthGrow)}/${keyLabel(this.keys.widthShrink)}`)} width`,
      `${ansi.bold(`${keyLabel(this.keys.heightShrink)}/${keyLabel(this.keys.heightGrow)}`)} height`,
      range,
      w,
    );
    return [top, sep, ...visibleBody.map((line) => padToWidth(line, w)), sep, footer1, footer2];
  }

  handleInput(data: string): void {
    const wheel = parseMouseWheel(data);
    if (wheel === "down") {
      this.scroll += 3;
      return;
    }
    if (wheel === "up") {
      this.scroll = Math.max(0, this.scroll - 3);
      return;
    }

    if (matchesAnyConfiguredKey(data, this.keys.close)) {
      this.close();
    } else if (this.toggleMouseWheel && matchesConfiguredKey(data, this.keys.toggleWheel)) {
      this.toggleMouseWheel();
    } else if (this.plainText && matchesConfiguredKey(data, this.keys.copyAll)) {
      copyToClipboard(this.plainText);
    } else if (this.plainText && matchesConfiguredKey(data, this.keys.copyView)) {
      copyToClipboard(this.visiblePlainText);
    } else if (this.resizeWidth && matchesConfiguredKey(data, this.keys.widthGrow)) {
      this.resizeWidth(4);
    } else if (this.resizeWidth && matchesConfiguredKey(data, this.keys.widthShrink)) {
      this.resizeWidth(-4);
    } else if (this.resizeHeight && matchesConfiguredKey(data, this.keys.heightShrink)) {
      this.resizeHeight(-3);
    } else if (this.resizeHeight && matchesConfiguredKey(data, this.keys.heightGrow)) {
      this.resizeHeight(3);
    }
  }

  invalidate(): void {
    this.body.invalidate();
  }
}

function getImageMimeType(filePath: string): string | undefined {
  switch (extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return undefined;
  }
}

function getCodeLanguage(filePath: string): string | undefined {
  switch (extname(filePath).toLowerCase()) {
    case ".ts":
    case ".tsx":
    case ".mts":
    case ".cts":
      return "typescript";
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".json":
    case ".jsonc":
      return "json";
    case ".md":
    case ".markdown":
      return "markdown";
    case ".html":
    case ".htm":
      return "html";
    case ".css":
      return "css";
    case ".scss":
      return "scss";
    case ".sh":
    case ".bash":
    case ".zsh":
      return "bash";
    case ".py":
      return "python";
    case ".rs":
      return "rust";
    case ".go":
      return "go";
    case ".java":
      return "java";
    case ".c":
    case ".h":
      return "c";
    case ".cc":
    case ".cpp":
    case ".cxx":
    case ".hpp":
      return "cpp";
    case ".cs":
      return "csharp";
    case ".swift":
      return "swift";
    case ".kt":
    case ".kts":
      return "kotlin";
    case ".rb":
      return "ruby";
    case ".php":
      return "php";
    case ".lua":
      return "lua";
    case ".sql":
      return "sql";
    case ".xml":
      return "xml";
    case ".yaml":
    case ".yml":
      return "yaml";
    case ".toml":
      return "toml";
    case ".ini":
      return "ini";
    case ".diff":
    case ".patch":
      return "diff";
    default:
      return undefined;
  }
}

function shouldRenderAsMarkdown(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ext === ".md" || ext === ".markdown";
}

function asHighlightedMarkdown(filePath: string, content: string): string {
  if (shouldRenderAsMarkdown(filePath)) return content;
  const language = getCodeLanguage(filePath) ?? "text";
  return `\`\`\`\`${language}\n${content}\n\`\`\`\``;
}

function expandPath(input: string): string {
  const s = input.trim().replace(/^['"]|['"]$/g, "");
  if (s === "~") return homedir();
  if (s.startsWith("~/")) return resolve(homedir(), s.slice(2));
  return s;
}

async function readClipboard(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("pbpaste", [], { timeout: 1000 });
    return stdout.trim();
  } catch {
    return "";
  }
}

async function openSidePreview(rawArgs: string, ctx: ExtensionCommandContext) {
  if (activePreviewClose) {
    activePreviewClose();
    if (!rawArgs.trim()) return;
  }

  let arg = rawArgs.trim();
  if (!arg) {
    const clip = await readClipboard();
    if (clip) arg = clip.split(/\r?\n/)[0]?.trim() ?? "";
  }
  if (!arg) {
    const entered = await ctx.ui.input("Markdown preview path:", "path/to/file.md");
    arg = entered?.trim() ?? "";
  }
  if (!arg) return;

  const filePath = resolve(ctx.cwd, expandPath(arg));
  const imageMimeType = getImageMimeType(filePath);
  let body: Component;
  let plainText: string | undefined;
  try {
    if (imageMimeType) {
      const imageBase64 = (await readFile(filePath)).toString("base64");
      body = new Image(
        imageBase64,
        imageMimeType,
        { fallbackColor: (text: string) => text },
        { maxWidthCells: 80, filename: basename(filePath) },
      );
    } else {
      const content = await readFile(filePath, "utf8");
      plainText = content;
      body = new Markdown(asHighlightedMarkdown(filePath, content), 1, 1, getMarkdownTheme());
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Failed to read file: ${message}`, "error");
    return;
  }

  let widthPercent = rememberedWidthPercent;
  const defaultBottomMarginRows = 7;
  const minBottomMarginRows = 7;
  let bottomMarginRows = rememberedBottomMarginRows;
  let heightRows: number | undefined = rememberedHeightRows;
  const overlayCustomOptions = imageMimeType
    ? undefined
    : {
        overlay: true,
        overlayOptions: {
          width: `${widthPercent}%` as `${number}%`,
          minWidth: 82,
          maxHeight: "92%" as `${number}%` | number,
          anchor: "top-right" as const,
          margin: { top: 1, right: 1, bottom: bottomMarginRows, left: 1 },
          nonCapturing: true,
        },
      };

  let mouseWheelEnabled = true;
  setMouseWheelReporting(true);
  try {
    await ctx.ui.custom<void>(
      (_tui, _theme, _keybindings, done) => {
        let closed = false;
        let removeInputListener: (() => void) | undefined;
        const close = () => {
          if (closed) return;
          closed = true;
          removeInputListener?.();
          setMouseWheelReporting(false);
          if (activePreviewClose === close) activePreviewClose = undefined;
          done(undefined);
        };
        activePreviewClose = close;
        const getTerminalRows = () => Math.max(10, Number((_tui as unknown as { terminal?: { rows?: number } }).terminal?.rows ?? 30));
        const getRows = () => heightRows ?? Math.max(8, getTerminalRows() - defaultBottomMarginRows - 1);
        const requestRender = () => (_tui as unknown as { requestRender: () => void }).requestRender();
        const resizeWidth = overlayCustomOptions
          ? (deltaPercent: number) => {
              widthPercent = Math.max(42, Math.min(75, widthPercent + deltaPercent));
              rememberedWidthPercent = widthPercent;
              overlayCustomOptions.overlayOptions.width = `${widthPercent}%`;
              requestRender();
            }
          : undefined;
        const resizeHeight = overlayCustomOptions
          ? (deltaRows: number) => {
              const terminalRows = getTerminalRows();
              const maxRows = Math.max(8, terminalRows - minBottomMarginRows - 1);
              heightRows = Math.max(8, Math.min(maxRows, getRows() + deltaRows));
              bottomMarginRows = Math.max(minBottomMarginRows, terminalRows - heightRows - 1);
              rememberedHeightRows = heightRows;
              rememberedBottomMarginRows = bottomMarginRows;
              overlayCustomOptions.overlayOptions.maxHeight = heightRows;
              overlayCustomOptions.overlayOptions.margin = { top: 1, right: 1, bottom: bottomMarginRows, left: 1 };
              requestRender();
            }
          : undefined;
        const toggleMouseWheel = () => {
          mouseWheelEnabled = !mouseWheelEnabled;
          setMouseWheelReporting(mouseWheelEnabled);
          requestRender();
        };
        const isMouseWheelEnabled = () => mouseWheelEnabled;
        const keys = getOverlayKeys();
        const preview = new SidePreview(
          basename(filePath),
          body,
          close,
          getRows,
          plainText,
          resizeWidth,
          resizeHeight,
          toggleMouseWheel,
          isMouseWheelEnabled,
          keys,
        );
        const isPreviewInput = (data: string) =>
          (mouseWheelEnabled && parseMouseWheel(data) !== undefined) ||
          matchesAnyConfiguredKey(data, keys.close) ||
          matchesConfiguredKey(data, keys.toggleWheel) ||
          (!!plainText && (matchesConfiguredKey(data, keys.copyView) || matchesConfiguredKey(data, keys.copyAll))) ||
          (!!resizeWidth && (matchesConfiguredKey(data, keys.widthGrow) || matchesConfiguredKey(data, keys.widthShrink))) ||
          (!!resizeHeight && (matchesConfiguredKey(data, keys.heightGrow) || matchesConfiguredKey(data, keys.heightShrink)));
        removeInputListener = (_tui as unknown as {
          addInputListener?: (listener: (data: string) => { consume?: boolean } | undefined) => () => void;
        }).addInputListener?.((data: string) => {
          if (!isPreviewInput(data)) return undefined;
          preview.handleInput(data);
          requestRender();
          return { consume: true };
        });
        return preview;
      },
      overlayCustomOptions,
    );
  } finally {
    setMouseWheelReporting(false);
  }
}

async function configureShortcuts(rawArgs: string, ctx: ExtensionCommandContext) {
  const args = rawArgs.trim();
  if (!args || args === "show") {
    ctx.ui.notify(`side-preview shortcuts: ${getConfiguredShortcuts().join(", ")}`, "info");
    return;
  }

  const config = loadConfig();
  if (args === "reset") {
    saveConfig({ ...config, shortcuts: DEFAULT_SHORTCUTS });
    ctx.ui.notify(`side-preview shortcuts reset: ${DEFAULT_SHORTCUTS.join(", ")}. Run /reload.`, "info");
    return;
  }

  const shortcuts = args
    .split(/[ ,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (shortcuts.length === 0) return;

  saveConfig({ ...config, shortcuts });
  ctx.ui.notify(`side-preview shortcuts saved: ${shortcuts.join(", ")}. Run /reload to apply.`, "info");
}

async function configureOverlayKeys(rawArgs: string, ctx: ExtensionCommandContext) {
  const args = rawArgs.trim();
  const current = getOverlayKeys();
  if (!args || args === "show") {
    ctx.ui.notify(
      `side-preview keys: toggleWheel=${current.toggleWheel}, copyView=${current.copyView}, copyAll=${current.copyAll}, widthGrow=${current.widthGrow}, widthShrink=${current.widthShrink}, heightShrink=${current.heightShrink}, heightGrow=${current.heightGrow}, close=${current.close.join("+")}`,
      "info",
    );
    return;
  }

  const config = loadConfig();
  if (args === "reset") {
    saveConfig({ ...config, keys: DEFAULT_KEYS });
    ctx.ui.notify("side-preview overlay keys reset.", "info");
    return;
  }

  const next: Partial<OverlayKeys> = { ...(config.keys ?? {}) };
  for (const token of args.split(/[ ,]+/).filter(Boolean)) {
    const [name, value] = token.split("=");
    if (!name || !value) continue;
    if (name === "close") {
      next.close = value.split("|").map((s) => s.trim().toLowerCase()).filter(Boolean);
    } else if (name in DEFAULT_KEYS) {
      (next as Record<string, string>)[name] = value.trim().toLowerCase();
    }
  }

  saveConfig({ ...config, keys: next });
  ctx.ui.notify("side-preview overlay keys saved. Reopen preview to apply.", "info");
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("side-preview", {
    description: "Open a file/image in a right-side preview. Usage: /side-preview <path>",
    handler: openSidePreview,
  });

  pi.registerCommand("side-preview-bind", {
    description: "Configure side-preview open shortcut(s). Usage: /side-preview-bind ctrl+alt+o [ctrl+shift+o] | show | reset. Requires /reload.",
    handler: configureShortcuts,
  });

  pi.registerCommand("side-preview-keys", {
    description: "Configure keys inside preview. Usage: /side-preview-keys toggleWheel=ctrl+m copyView=ctrl+y copyAll=ctrl+shift+y widthGrow=alt+left widthShrink=alt+right heightShrink=alt+up heightGrow=alt+down close=escape",
    handler: configureOverlayKeys,
  });

  const shortcutHandler = async (ctx: ExtensionCommandContext) => {
    await openSidePreview("", ctx);
  };

  for (const shortcut of getConfiguredShortcuts()) {
    pi.registerShortcut(shortcut, {
      description: "Open side preview for path from clipboard, or ask for a path",
      handler: shortcutHandler,
    });
  }
}
