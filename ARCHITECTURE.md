# Architecture

The extension is five source files. This document exists mainly to record one decision, so it is not made again by accident.

## Cost before features

The value delivered is small — it tells you which project a window belongs to. Nobody keeps an extension that makes their editor feel slower in exchange for that, so the budget comes first:

- **One status-bar item, one decoration type, three event subscriptions, zero I/O.** The badge is recomputed when `onDidChangeConfiguration` (filtered to our section), `onDidChangeWorkspaceFolders`, or `onDidChangeWindowState` fires — so twice per focus gain, since the flash renders and then un-renders.
- **The decoration type carries the appearance, and a focus event does no stylesheet work.** The obvious shape — one bare type plus per-range `DecorationInstanceRenderOptions` — is the expensive one. `CodeEditorWidget.setDecorationsByType` hashes the instance options, registers a decoration _sub-type_ for that hash (`registerDecorationType` → `DecorationCSSRules` → `insertRule`, plus a theme listener), and the trailing sweep in the same method removes any sub-type absent from the new call — so clearing the announcement drops the rule again. That is an insert and a remove per focus. Building the appearance into the type instead, and caching it against the name and the appearance settings, registers the rule once. Passing a plain `Range[]` rather than `DecorationOptions[]` also takes `$trySetDecorationsFast`, which sends four packed numbers per range instead of a serialized object graph.
- **No timer at rest.** One exists only while a focus flash is on screen — roughly a second — and it is cleared both on the next flash and on disposal. A burst of focus events cannot strobe the badge: re-flashing is refused within 400 ms, which is a correctness guard rather than a setting.
- **No runtime dependencies.** `package.json` has `devDependencies` only.
- **Nothing polls** — not the filesystem, not the workspace, not the window state.

## Files

| File                            | Responsibility                                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/extension.ts`              | Activation wiring only.                                                                                                                  |
| `src/configuration/settings.ts` | Typed settings reads and all validation.                                                                                                 |
| `src/project/projectName.ts`    | Pure name resolution (label / single folder / multi-root / empty).                                                                       |
| `src/ui/statusBar.ts`           | The badge, and the focus flash. `badgeStyle()` is a pure function so the appearance decision is testable without a live `StatusBarItem`. |
| `src/ui/editorAnnouncement.ts`  | The in-editor announcement. `announcementDecoration()` and `anchorRange()` are pure for the same reason.                                 |

Settings are read through helpers that check the runtime type. `getConfiguration().get()` returns raw JSON, so the type parameter is a claim rather than a guarantee — a number where a string belongs would otherwise throw out of `activate` and take the whole extension down, badge included. Colors must be a hex value or a theme color id; codicon names must be plain `[a-z0-9-]` identifiers. Unrecognized input falls back to the default.

## Removed in 2.0.0: do not reintroduce without reading this

Versions up to 1.0.0 also flashed the project name over the middle of the window on focus, and rendered it as a pill in the title bar. Both worked. Both are gone.

**There is no extension API for either surface.** This was verified against VS Code's source, not inferred: `MenuId.TitleBar`, `MenuId.TitleBarAdjacentCenter` and `MenuId.CommandCenter` all exist and the built-in "Update" and "Sign in" pills use them — but the allowlist of menus extensions may contribute to (`apiMenus` in `vs/workbench/services/actions/common/menusExtensionPoint.ts`, roughly 95 entries) contains no title-bar or command-center id. The supported surfaces are notifications, Quick Picks, status-bar items, views and webviews; a Quick Pick steals keyboard focus and a webview steals editor layout, so neither can announce a window without interrupting the user.

The only remaining route was to add a stylesheet and a script to VS Code's own `workbench.html`. That was implemented carefully — marker-delimited so removal restored the file byte for byte, same-origin references so the Content Security Policy needed no weakening, atomic per-process writes, and automatic re-application after a VS Code update.

**It was still the wrong thing to ship.** `workbench.html` is in `product.json`'s `checksums` map, so a patched installation makes VS Code report _"Your Code installation appears to be corrupt. Please reinstall."_ — permanently, and again after every update. The warning is accurate: the file genuinely differs from what Microsoft shipped. Silencing it by rewriting the checksum would have meant suppressing a true integrity signal, so that was rejected too.

Asking users to accept a corrupt-installation warning in exchange for a nicer label is not a reasonable trade, so the feature was removed rather than kept behind a setting. A flag would not have helped: the warning is what makes the trade unacceptable, and a flag only moves the decision to someone with less context.

Writing the user's settings for them was tried too, in 2.3.0: a command that set `window.commandCenter` and the `commandCenter.*` colors, turning the Command Center into a colored pill. It worked and broke no rules, but it was withdrawn in 2.4.0 as too much friction for a color — it needed a command, a confirmation, and it wrote into workspace settings that are usually committed, all so the Command Center (which is clickable, and opens a quick pick) could be tinted. Anyone wanting it can set those three keys by hand.

If this is ever revisited, the constraint to check first is whether VS Code has gained a contributable title-bar menu id or an overlay surface. Until then, the answer is the status bar.

The focus flash was the first replacement. `StatusBarItem.backgroundColor` honors only `statusBarItem.warningBackground` and `statusBarItem.errorBackground`, so "prominent" means the theme's warning color, not the badge color — a limitation of the supported API rather than a choice. The flash therefore drops its own foreground while active, because setting one on top of that background fights the theme and can render unreadably.

**That flash is invisible in some themes, and the reason is worth recording.** Dracula Soft rebinds `editorWarning.foreground` to a cyan (`#97e1f1`) and does not define `statusBarItem.warningBackground`, so VS Code derives the latter as `darken(#97e1f1, 0.4)` = `#1CAFCF` — 2.8° of hue from the badge's own `#22D3EE`. The flash changes fill but not color, in the corner of the eye, for about a second. On a stock dark theme the same code yields amber `#7A6400`. Nothing can be done about it from the extension: the background color is not ours to choose.

So the **editor decoration** carries the announcement instead, and its color _is_ ours. It attaches at the end of a line rather than at column 0, because an attachment at column 0 pushes the line's own text right and reads as if the file changed; past the end of the line is where inline blame annotations sit. Which line is `editorAnnouncement.position`, and it defaults to the middle of the viewport rather than the top: scaled past 100% the attachment is taller than the line box it hangs off and the overflow goes upward, so on the first visible line the breadcrumb bar paints over it. The middle is clear of both breadcrumbs and sticky scroll, and is where the eye already is. It is applied to every entry in `visibleTextEditors` so split layouts announce too, and cleared against the editors that were decorated rather than the currently visible ones — that set can change while an announcement is on screen. Nothing is announced when no text editor is visible; the badge covers that case.

The announcement is a filled pill when its color is a hex value, because a readable foreground can be derived from it, and outlined when it is a theme color id, because the id's value is not knowable here and light-on-light is the failure to avoid.

**The one unsupported thing in this extension.** `ThemableDecorationAttachmentRenderOptions` has no `fontSize` — the twelve properties it does expose are copied verbatim into a CSS rule, with no escaping. `fontSizePercent` above 100 therefore appends `font-size` to `textDecoration`. This was a deliberate, informed choice by the repo owner rather than a shortcut: it is opt-out, the value is clamped to 100–500 before it reaches the stylesheet, and it fails soft — if VS Code ever escapes those values the declaration becomes invalid, the browser drops it, and the announcement renders at the editor's own size. Nothing else here depends on undocumented behavior.

Two API traps found while building this:

- **`onDidChangeWindowState` is not a focus event.** It also fires when `WindowState.active` changes, which is driven by a ten-second user-idle timer. Testing `state.focused` as a level therefore announces during ordinary work in a window that never lost focus. `isFocusGain()` in `src/extension.ts` makes it edge-triggered.
- **A tab is not an option.** `createWebviewPanel` with `preserveFocus` keeps keyboard focus but VS Code still opens the editor with `activation: RESTORE`, so the panel becomes the visible tab. Announcing that way would hide and restore the user's file on every window switch, plus a webview create/destroy cycle each time.

## Working on it

The README is the marketplace page and is written for people deciding whether to install this. Everything a contributor needs lives here instead.

```bash
npm install   # also points core.hooksPath at .githooks
npm test      # clean, compile, bundle, lint, format check, then Mocha
npm run watch # then F5 in VS Code to launch an Extension Development Host
npm run package
```

`pre-commit` type-checks, lints and checks formatting; `pre-push` runs the full suite; CI repeats both and proves the manifest still packages.

The bundle step in `pretest` is not optional — `main` points at `dist/extension.js`, so without it the test host cannot load the extension and every command-registration assertion fails. `vscode:prepublish` cleans first, so compiled output from a deleted source file cannot survive into a VSIX.

Tests run inside a real extension host, so `vscode.Range`, a live `TextEditor` and the command registry are all available to assert against. Prefer that over mocks. Note that an SVG in `README.md` is rejected by `vsce` — the banner there has to be the PNG.
