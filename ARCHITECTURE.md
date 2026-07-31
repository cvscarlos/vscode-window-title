# Architecture

The extension is three source files. This document exists mainly to record one decision, so it is not made again by accident.

## Cost before features

The value delivered is small — it tells you which project a window belongs to. Nobody keeps an extension that makes their editor feel slower in exchange for that, so the budget comes first:

- **One status-bar item, three event subscriptions, zero I/O.** The badge is recomputed only when `onDidChangeConfiguration` (filtered to our section), `onDidChangeWorkspaceFolders`, or `onDidChangeWindowState` fires.
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

Settings are read through helpers that check the runtime type. `getConfiguration().get()` returns raw JSON, so the type parameter is a claim rather than a guarantee — a number where a string belongs would otherwise throw out of `activate` and take the whole extension down, badge included. Colors must be a hex value or a theme color id; codicon names must be plain `[a-z0-9-]` identifiers. Unrecognized input falls back to the default.

## Removed in 2.0.0: do not reintroduce without reading this

Versions up to 1.0.0 also flashed the project name over the middle of the window on focus, and rendered it as a pill in the title bar. Both worked. Both are gone.

**There is no extension API for either surface.** This was verified against VS Code's source, not inferred: `MenuId.TitleBar`, `MenuId.TitleBarAdjacentCenter` and `MenuId.CommandCenter` all exist and the built-in "Update" and "Sign in" pills use them — but the allowlist of menus extensions may contribute to (`apiMenus` in `vs/workbench/services/actions/common/menusExtensionPoint.ts`, roughly 95 entries) contains no title-bar or command-center id. The supported surfaces are notifications, Quick Picks, status-bar items, views and webviews; a Quick Pick steals keyboard focus and a webview steals editor layout, so neither can announce a window without interrupting the user.

The only remaining route was to add a stylesheet and a script to VS Code's own `workbench.html`. That was implemented carefully — marker-delimited so removal restored the file byte for byte, same-origin references so the Content Security Policy needed no weakening, atomic per-process writes, and automatic re-application after a VS Code update.

**It was still the wrong thing to ship.** `workbench.html` is in `product.json`'s `checksums` map, so a patched installation makes VS Code report _"Your Code installation appears to be corrupt. Please reinstall."_ — permanently, and again after every update. The warning is accurate: the file genuinely differs from what Microsoft shipped. Silencing it by rewriting the checksum would have meant suppressing a true integrity signal, so that was rejected too.

Asking users to accept a corrupt-installation warning in exchange for a nicer label is not a reasonable trade, so the feature was removed rather than kept behind a setting. A flag would not have helped: the warning is what makes the trade unacceptable, and a flag only moves the decision to someone with less context.

If this is ever revisited, the constraint to check first is whether VS Code has gained a contributable title-bar menu id or an overlay surface. Until then, the answer is the status bar.

The focus flash is what replaced it. `StatusBarItem.backgroundColor` honours only `statusBarItem.warningBackground` and `statusBarItem.errorBackground`, so "prominent" means the theme's warning colour, not the badge colour — a deliberate limitation of the supported API rather than a choice. The flash therefore drops its own foreground while active, because setting one on top of that background fights the theme and can render unreadably.
