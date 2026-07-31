# Changelog

## 2.1.0

- The badge briefly turns prominent when the window gains focus, so you notice which project you switched to without anything being drawn over the editor. Off via `statusBar.flashOnFocus`; duration via `statusBar.flashMilliseconds`.
- Only a transition into focus announces. Losing focus is silent, the window already focused at startup is not announced, and re-flashing is refused within 400 ms so a burst of focus events cannot strobe the badge.
- The flash uses `statusBarItem.warningBackground`, one of only two background colors VS Code honours on a status-bar item, so its colour follows your theme rather than `statusBar.color`.

## 2.0.0

**Breaking: the centered overlay and the title-bar pill are removed, and the extension no longer modifies your VS Code installation.**

Both features worked by adding a stylesheet and a script to VS Code's `workbench.html`, because the extension API offers no overlay or title-bar surface. That file is checksummed by VS Code, so a patched installation permanently reported _"Your Code installation appears to be corrupt. Please reinstall."_ — and again after every update. The warning was accurate, and silencing it would have meant suppressing a true integrity check, so the feature was withdrawn instead.

**If you ran 1.0.0 with either feature enabled, revert it before upgrading.** Run _Window Title nt: Remove In-Window Display_ on 1.0.0 and reload. Version 2.0.0 contains no patcher, so it cannot undo a patch an earlier version left behind — upgrading without reverting first would strand the modification, and the corrupt-installation warning with it. 1.0.0 was never published to the Marketplace, so in practice this affects only installations built from source.

To recover an already-upgraded installation, delete `nt-window-title.css` and `nt-window-title.js` next to VS Code's `workbench.html` and remove the two `<!-- nt-window-title:begin … -->` blocks from that file; reinstalling VS Code also works.

- Removed the centered focus HUD, the title-bar pill, all six commands, and the fourteen `hud.*` / `titleBarPill.*` settings.
- Removed the workbench patcher, the generated assets, the invisible-marker name channel and the output channel — none of it has a purpose without the patch.
- The status-bar badge is unchanged: name, color, alignment, icon and the per-project `label` override all behave as before.

## 1.0.0

First release.

- Project name badge in the status bar, cyan by default, with configurable side, color and codicon.
- Optional centered HUD that flashes the project name over the middle of the window when it gains focus, installed by adding a stylesheet and a module script to VS Code's workbench page. Off by default; enabling it explains the consequences first, and disabling it restores the page byte for byte.
- Optional title-bar pill showing the project name, styled by reproducing VS Code's own `.update-indicator.prominent` rule (theme corner-radius and font-size tokens, button colors), so it is indistinguishable from the built-in "Update" and "Sign in" pills in any theme. It re-asserts itself when VS Code rebuilds the title bar, and never intercepts clicks or the window-drag region.
- Either in-window feature alone installs the patch; the assets carry both, so enabling the second costs nothing extra.
- The HUD reads the resolved name from the status-bar badge through an invisible marker pair, so it stays correct per window without depending on VS Code internals.
- The patch is idempotent, detects its own staleness after a settings change, and re-applies itself after a VS Code update.
- The centered overlay mounts inside `.monaco-workbench`, where VS Code defines its theme custom properties, so it now genuinely uses the theme background, border and interface font instead of silently falling back to hardcoded values and a serif face. `hud.fontFamily` chooses between the interface font and a monospace stack, and `hud.color` accepts theme color ids as well as hex.
- Settings that drive the shared patch are application-scoped, so a repository cannot enable it (and bypass the consent prompt) through workspace settings.
- Removal refuses to write a page that stripping would damage, and the backup taken before the first patch is now readable via _Restore Workbench From Backup_.
- Marker detection and removal share one pattern, so a block from a future hash format stays strippable instead of accumulating duplicates.
- Concurrent patching from several windows uses a per-process scratch path, so their atomic renames cannot collide; every patch error names the underlying errno.
- Default configuration holds no timers and performs no I/O.
