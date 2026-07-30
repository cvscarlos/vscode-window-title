# Architecture

The canonical design document. Read this before changing the patch or the name channel.

## Design principle: cost before features

The value this extension delivers is small — it tells you which project a window belongs to. Nobody keeps an extension that makes their editor feel slower in exchange for that. So the cost budget comes first and every feature is shaped to fit it:

- **Default configuration: zero timers, zero I/O.** One status-bar item, two event subscriptions (`onDidChangeConfiguration` filtered to our section, `onDidChangeWorkspaceFolders`). The badge is recomputed only when one of those fires.
- **No runtime dependencies.** `package.json` has `devDependencies` only.
- **Nothing polls.** Not the filesystem, not the workspace, not the window state.
- **The extension host does no work on focus.** Focus is detected in the renderer by the injected script, so a window switch costs the extension host nothing.

The `hud.patched` flag in `globalState` exists purely to serve this budget: without it, an activation with the HUD disabled would still have to read `workbench.html` to discover there is nothing to undo.

## Two layers

**Layer 1 — the extension host** resolves the project name and publishes the status-bar badge. Small, ordinary, fully testable.

**Layer 2 — the renderer** is where the in-window features live — the centered HUD and the title-bar pill — as a stylesheet and an ES module added to the workbench page. It is completely independent of the extension host at runtime.

Both features share one pair of generated assets, and `needsInjection()` is simply "is either enabled". Neither is subordinate to the other: turning on the pill alone installs the patch, and the patch is removed only when both are off. The asset hash covers both feature flags, so toggling either marks the installed patch stale and it refreshes.

The pill copies VS Code's own treatment rather than inventing one. The source of truth is `.update-indicator` / `.update-indicator.prominent` in `vs/workbench/contrib/update/browser/media/updateTitleBarEntry.css` — the real "Update" pill; the "Sign in" pill is the same treatment, registered on the same menu at "the same position as the update button". That means 22 px tall, `0 8px` padding, `border-box`, a 1px border matching the background, and — importantly — the **theme tokens** `--vscode-cornerRadius-medium` and `--vscode-bodyFontSize-small` rather than hardcoded `6px`/`12px`, plus no bold weight. Hardcoding those would drift the moment VS Code retunes its corner radius or font scale.

Why this is the only route: the menu ids `MenuId.TitleBar` and `MenuId.TitleBarAdjacentCenter` exist, and the built-in pills use the latter, but the extension-contributable allowlist in `vs/workbench/services/actions/common/menusExtensionPoint.ts` contains no title-bar or command-center key. Extensions genuinely cannot contribute there.

The pill mounts in `.titlebar-right` — the flex row (`align-items: center`) that holds the window controls and the container carrying the built-in pills, so ours lands immediately beside them. It deliberately does **not** mount inside `.center-adjacent-toolbar-container`, which is where those pills actually live: that element is `display: block`, 44 px tall and starts 8 px above the title bar, so a child anchors to its box and is clipped off the top of the window. That was measured, not guessed. It is `pointer-events: none`, so it can never intercept a click or break the window-drag region, and `aria-hidden`, since the name is already the window title. VS Code rebuilds the title bar on layout and title changes, which would drop the pill; a `childList`-only `MutationObserver` on the single insertion parent puts it back. That is the cheapest possible re-assertion — it fires when children change, not continuously — and subtree/characterData observation is deliberately avoided because the title text changes constantly. The pill is never inserted inside `.window-title`, so it cannot become its own name source via the title-bar fallback.

They are connected only at install time (the host writes the assets) and through the DOM (the HUD reads the name from the badge). There is no IPC and no shared state.

## Theming: the overlay must live inside `.monaco-workbench`

Every `--vscode-*` custom property is defined on the **`.monaco-workbench`** element, not on `html` or `body`. Verified live: `--vscode-foreground` = `#bfbfbf`, `--vscode-editorWidget-background` = `#202122`, `--vscode-terminal-ansiCyan` = `#11a8cd`, `--vscode-cornerRadius-medium` = `6px` — and every one of them empty on `body`.

The overlay was originally appended to `document.body`, which is _outside_ that element. Every `var(--vscode-…)` therefore resolved to nothing and silently fell back to the hardcoded literals, so the HUD never used the theme at all. Worse, `body` computes to **Times 11px** in the workbench page, so the announcement rendered in a serif face. It now mounts inside `.monaco-workbench` and **re-homes on every announcement**, because an announcement can fire before that element exists and an overlay parked on `body` would otherwise stay unthemed for the rest of the session.

Two consequences worth remembering:

- **`--vscode-font-family` does not exist**, and neither does `--vscode-editor-font-family`; both are empty even on `.monaco-workbench`. Referencing them was a silent no-op. So `fontFamily: 'ui'` uses `inherit` — which, now that the overlay sits inside the workbench, genuinely picks up the interface font — and `'mono'` ships an explicit stack, since there is no editor-font property to read.
- **Theme colour ids map to custom properties** by replacing dots with dashes: `terminal.ansiCyan` becomes `var(--vscode-terminal-ansiCyan)`. `toCssColor()` performs that conversion, so both the badge and the overlay accept theme ids and follow the active theme. The pill still requires a hex value, because it derives its text colour from luminance.

## Why the status bar is the name channel

The HUD runs inside the workbench renderer, which has no handle on the extension host. It therefore has to discover the project name from the DOM. The candidates are all poor: `document.title` follows the user's `window.title` template and needs fragile parsing; `.window-title` does not exist under a native title bar; VS Code's internal DOM ids are not API.

So the badge carries the name explicitly. `ProjectStatusBar` renders the resolved name wrapped in two invisible Unicode `Cf` format characters (`U+2062 INVISIBLE TIMES`, `U+2063 INVISIBLE SEPARATOR`). The HUD scans `.statusbar-item` nodes for that pair and takes what is between them. This is exact, per-window correct, costs one DOM query per announcement, and depends on no VS Code internals. `src/hud/markers.ts` owns both sides of the convention; the generated script re-derives the same two code points and must stay in step with it.

Fallbacks, in order, for when the badge is disabled: the marker scan, then `.window-title`, then `document.title`. All are stripped of codicon glyphs (Private Use Area code points) before use.

## The patch, and the constraints that shape it

VS Code 1.130 serves the workbench from `out/vs/code/electron-browser/workbench/workbench.html`. Its CSP dictates the entire approach:

| CSP directive                                                  | Consequence                                                                                                                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `script-src 'self' 'unsafe-eval' blob:` — no `'unsafe-inline'` | An inline `<script>` would be blocked. The HUD ships as its own file next to `workbench.html` and is referenced relatively, which `'self'` permits.               |
| `style-src 'self' 'unsafe-inline'`                             | The stylesheet could be inline, but ships as a file for symmetry.                                                                                                 |
| `default-src 'none'`, `connect-src 'self' https: ws:`          | No `fetch`, no file reads. **All configuration is baked into the generated script as literals**, which is why a settings change means regenerating the assets.    |
| `require-trusted-types-for 'script'`                           | The HUD builds its DOM with `createElement` and `textContent` only. `innerHTML` and friends would throw. A test asserts the generated code contains no such sink. |

**The CSP is never modified.** Extensions in this space commonly strip or relax it; this one does not need to, and does not.

### Idempotency, staleness and concurrency

Each injected block is delimited by `<!-- nt-window-title:begin <hash> -->` / `<!-- nt-window-title:end -->`, where the hash identifies the exact asset pair. That gives three properties cheaply:

- **Idempotent.** `buildPatchedHtml` strips every existing block before inserting, so patching a patched page is a no-op.
- **Reversible.** The block pattern includes its own indentation and trailing newline, so `stripPatch` restores the original bytes exactly. A test asserts byte equality against a copy of the real workbench page; a backup of the untouched page is also kept per VS Code build, as a safety net rather than the primary undo path.
- **Staleness detection.** A patch whose marker hash differs from the assets we would generate now is `stale` and gets refreshed. This is what makes a settings change and an extension upgrade self-healing.

Several windows may sync at once — which is the normal case for this extension, since its whole purpose is telling many open windows apart. No locking is needed: every window strips first and inserts once, so they converge on identical content, and writes are write-then-rename so a partially written `workbench.html` is impossible.

**The scratch path must be unique per process**, and originally was not. With a shared `<file>.nt-tmp`, several windows wrote the same scratch file, the first rename consumed it, and the rest failed with `ENOENT` — reported as an opaque `ioFailure`. `temporaryPathFor()` now includes the pid and a random suffix. Relatedly, every `PatchError` names the underlying errno: the first version of that message said only "Could not write <path>", which made the race undiagnosable from the log.

A VS Code update replaces the whole installation directory, which removes both the markers and the assets. The next activation sees `notPatched`, re-applies, and offers a reload.

### What is deliberately not done

- **The checksum in `product.json` is not rewritten.** `workbench.html` is checksummed, so patching triggers VS Code's "installation appears to be corrupt" warning. Silencing it would mean suppressing a true statement about a modified installation. The warning is documented instead.
- **The HUD is opt-in**, default off. Modifying someone's editor is not a thing to do by default, and the modal confirmation spells out the consequences.
- **No dependency on Custom UI Style** or any other injection extension. Requiring a second extension plus hand-written absolute paths in settings would not be "one more extension".

## Files

| File                            | Responsibility                                                             |
| ------------------------------- | -------------------------------------------------------------------------- |
| `src/extension.ts`              | Activation wiring only.                                                    |
| `src/configuration/settings.ts` | Typed settings reads and **all** validation.                               |
| `src/project/projectName.ts`    | Pure name resolution (label / single folder / multi-root / empty).         |
| `src/ui/statusBar.ts`           | The badge, and one half of the name channel.                               |
| `src/hud/markers.ts`            | The marker convention, shared by badge and HUD.                            |
| `src/hud/assets.ts`             | Generates the CSS and the ES module, and hashes them.                      |
| `src/hud/workbenchPatcher.ts`   | Locating, patching, stating and reverting the workbench page.              |
| `src/hud/hudController.ts`      | Reconciles installed state with settings; owns the commands and messaging. |
| `src/log.ts`                    | Output channel, created on first use.                                      |

## Validation is a security boundary

Every configurable value reaches either generated CSS or generated JavaScript running inside VS Code's own renderer, which has `unsafe-eval`. So `settings.ts` is the choke point and nothing untrusted passes it:

- Colors must match a hex pattern, or a theme color id for the badge only (a theme id means nothing inside a plain stylesheet, so the HUD falls back to `var(--vscode-foreground)`).
- Codicon names must be plain `[a-z0-9-]` identifiers; `$(...)` wrapping is tolerated and unwrapped.
- Numbers are clamped to explicit ranges, with a fallback for non-finite input.
- The project name is only ever assigned via `textContent`, never interpolated into markup or code.

Anything unrecognized falls back to a default rather than passing through. `settings.test.ts` covers the rejection cases directly.
