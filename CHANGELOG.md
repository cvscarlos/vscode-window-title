# Changelog

## 0.1.0

Initial release.

- Project name badge in the status bar, cyan by default, with configurable side, color and codicon.
- Optional centered HUD that flashes the project name over the middle of the window when it gains focus, installed by adding a stylesheet and a module script to VS Code's workbench page. Off by default; enabling it explains the consequences first, and disabling it restores the page byte for byte.
- Optional title-bar pill showing the project name, styled by reproducing VS Code's own `.update-indicator.prominent` rule (theme corner-radius and font-size tokens, button colors), so it is indistinguishable from the built-in "Update" and "Sign in" pills in any theme. It re-asserts itself when VS Code rebuilds the title bar, and never intercepts clicks or the window-drag region.
- Either in-window feature alone installs the patch; the assets carry both, so enabling the second costs nothing extra.
- The HUD reads the resolved name from the status-bar badge through an invisible marker pair, so it stays correct per window without depending on VS Code internals.
- The patch is idempotent, detects its own staleness after a settings change, and re-applies itself after a VS Code update.
- The centered overlay mounts inside `.monaco-workbench`, where VS Code defines its theme custom properties, so it now genuinely uses the theme background, border and interface font instead of silently falling back to hardcoded values and a serif face. `hud.fontFamily` chooses between the interface font and a monospace stack, and `hud.color` accepts theme color ids as well as hex.
- Concurrent patching from several windows uses a per-process scratch path, so their atomic renames cannot collide; every patch error names the underlying errno.
- Default configuration holds no timers and performs no I/O.
