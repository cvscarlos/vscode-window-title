# Architecture

The extension is three source files. This document exists mainly to record one decision, so it is not made again by accident.

## Cost before features

The value delivered is small — it tells you which project a window belongs to. Nobody keeps an extension that makes their editor feel slower in exchange for that, so the budget comes first:

- **One status-bar item, one decoration type, three event subscriptions, zero I/O.** The badge is recomputed only when `onDidChangeConfiguration` (filtered to our section), `onDidChangeWorkspaceFolders`, or `onDidChangeWindowState` fires. The decoration type is created once at activation, because each `createTextEditorDecorationType` call injects a CSS rule.
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

If this is ever revisited, the constraint to check first is whether VS Code has gained a contributable title-bar menu id or an overlay surface. Until then, the answer is the status bar.

The focus flash was the first replacement. `StatusBarItem.backgroundColor` honours only `statusBarItem.warningBackground` and `statusBarItem.errorBackground`, so "prominent" means the theme's warning colour, not the badge colour — a limitation of the supported API rather than a choice. The flash therefore drops its own foreground while active, because setting one on top of that background fights the theme and can render unreadably.

**That flash is invisible in some themes, and the reason is worth recording.** Dracula Soft rebinds `editorWarning.foreground` to a cyan (`#97e1f1`) and does not define `statusBarItem.warningBackground`, so VS Code derives the latter as `darken(#97e1f1, 0.4)` = `#1CAFCF` — 2.8° of hue from the badge's own `#22D3EE`. The flash changes fill but not colour, in the corner of the eye, for about a second. On a stock dark theme the same code yields amber `#7A6400`. Nothing can be done about it from the extension: the background colour is not ours to choose.

So the **editor decoration** carries the announcement instead, and its colour _is_ ours. It attaches at the end of the first visible line rather than at column 0, because an attachment at column 0 pushes the line's own text right and reads as if the file changed; past the end of the line is where inline blame annotations sit. It is applied to every entry in `visibleTextEditors` so split layouts announce too, and cleared against the editors that were decorated rather than the currently visible ones — that set can change while an announcement is on screen. Nothing is announced when no text editor is visible; the badge covers that case.

The announcement is a filled pill when its color is a hex value, because a readable foreground can be derived from it, and outlined when it is a theme color id, because the id's value is not knowable here and light-on-light is the failure to avoid.

**The one unsupported thing in this extension.** `ThemableDecorationAttachmentRenderOptions` has no `fontSize` — the twelve properties it does expose are copied verbatim into a CSS rule, with no escaping. `fontSizePercent` above 100 therefore appends `font-size` to `textDecoration`. This was a deliberate, informed choice by the repo owner rather than a shortcut: it is opt-out, the value is clamped to 100–500 before it reaches the stylesheet, and it fails soft — if VS Code ever escapes those values the declaration becomes invalid, the browser drops it, and the announcement renders at the editor's own size. Nothing else here depends on undocumented behaviour.

**The title bar, revisited.** An extension still cannot draw there. What it can do is write the settings a user would write by hand: `window.commandCenter` plus `commandCenter.*` color customizations turn the Command Center into a colored pill around the window title. `src/ui/titleBarColor.ts` does that, and the merge is a pure function precisely because `workbench.colorCustomizations` usually holds unrelated keys and per-theme blocks — replacing that object instead of merging would destroy them, in a file that is often committed. Clearing removes only our six keys.

Two API traps found while building this:

- **`onDidChangeWindowState` is not a focus event.** It also fires when `WindowState.active` changes, which is driven by a ten-second user-idle timer. Testing `state.focused` as a level therefore announces during ordinary work in a window that never lost focus. `isFocusGain()` in `src/extension.ts` makes it edge-triggered.
- **A tab is not an option.** `createWebviewPanel` with `preserveFocus` keeps keyboard focus but VS Code still opens the editor with `activation: RESTORE`, so the panel becomes the visible tab. Announcing that way would hide and restore the user's file on every window switch, plus a webview create/destroy cycle each time.
