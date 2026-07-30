# Window Title nt

**Know which project a VS Code window belongs to, at a glance.**

When you keep a window open per repository, the folder name buried in the title bar is easy to miss. This extension makes it obvious in three places:

- **A project badge in the status bar** — always visible, cyan by default.
- **A centered HUD on focus** — the project name flashes over the middle of the window when it gains focus, the way macOS announces a keyboard connecting, then fades out.
- **A pill in the title bar** — the project name as a filled pill styled exactly like VS Code's own "Update" and "Sign in" pills, so it looks native in any theme.

The badge works out of the box. The HUD and the pill are opt-in, because they need to modify your VS Code installation — see [In-window display](#in-window-display) before enabling either.

## Performance

This is the whole point of the design, so it is worth being concrete. With the default settings the extension holds **one status-bar item, two event subscriptions, and zero timers**, and performs **no filesystem or network I/O at all**. The badge is recomputed only when the workspace folders or the extension's own settings change.

Enabling the HUD adds one read of `workbench.html` per window activation, and puts a 4 KB script in the workbench page whose steady-state cost is a single `focus` listener. A timer exists only during the ~1 second the HUD is on screen. Nothing polls, nothing watches the filesystem, and there are no runtime dependencies.

## In-window display

VS Code's extension API has no surface for an arbitrary overlay or for a title-bar entry: extensions get notifications, Quick Picks, status-bar items, views, and webviews. A Quick Pick steals keyboard focus and a webview steals editor layout, so neither can announce a window without interrupting you. The only way to draw over the middle of the window — or to put anything in the title bar — is to add a stylesheet and a script to the workbench page itself, which is what this extension does when you enable either feature.

Both features ship in the same injected pair of files, so enabling the second one costs nothing extra. The pill reproduces VS Code's own `.update-indicator.prominent` rule — the real "Update" pill, and the same treatment as "Sign in" — down to the `--vscode-cornerRadius-medium` and `--vscode-bodyFontSize-small` theme tokens, so it is indistinguishable from the built-in pills and follows whatever theme you run.

**What it changes.** Two files (`nt-window-title.css`, `nt-window-title.js`) are written next to VS Code's `workbench.html`, and two marker-delimited blocks are added to that file referencing them. Both references are same-origin and relative, so they satisfy the workbench's existing Content Security Policy — **the CSP itself is never modified or weakened**. An untouched copy of the page is saved first, and the injected blocks are delimited so removal restores the original file byte for byte.

**What to expect.**

- VS Code will report that **"Your Code installation appears to be corrupt"**. That warning is VS Code correctly noticing this change — `workbench.html` is one of the files it checksums. It is dismissible via _Don't Show Again_. This extension does not silence it by rewriting the checksum.
- A VS Code update replaces the installation directory and wipes the change. The extension detects that and re-applies it automatically, then offers to reload.
- Changing a HUD setting rewrites the assets and offers a reload.
- Disabling **both** features reverts everything and deletes the two files.
- If the installation is not writable by your user (a managed or root-owned install), it reports that and stays off. The status-bar badge is unaffected.
- The `hud.*` and `titleBarPill.*` settings are **application-scoped**: they can only be set in your own user settings, never by a repository's `.vscode/settings.json`. They configure a machine-wide change to VS Code, so no project gets to make that decision for you. `label` and `statusBar.*` remain per-project.

## Commands

| Command                                          | Description                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| `Window Title nt: Enable Centered HUD`           | Asks for confirmation, then patches the installation.                          |
| `Window Title nt: Disable Centered HUD`          | Reverts the patch and deletes the injected files.                              |
| `Window Title nt: Enable Title Bar Pill`         | Shows the project name as a filled pill in the title bar.                      |
| `Window Title nt: Disable Title Bar Pill`        | Removes the pill.                                                              |
| `Window Title nt: Re-apply In-Window Display`    | Rewrites the patch — use it if the HUD or pill stops appearing.                |
| `Window Title nt: Remove In-Window Display`      | Turns both in-window features off — one action reverts the installation.       |
| `Window Title nt: Restore Workbench From Backup` | Puts back the page saved before the first patch, for when it has been damaged. |
| `Window Title nt: Show Output`                   | Opens the log.                                                                 |

## Settings

| Setting                                 | Default     | Description                                                                                                                                        |
| --------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ntWindowTitle.label`                   | `""`        | Name to announce instead of the folder name. Set it per project in workspace settings when the folder name is not the name you think in.           |
| `ntWindowTitle.statusBar.enabled`       | `true`      | Show the badge. The HUD reads the name from it, so turning it off also removes the HUD's most reliable name source.                                |
| `ntWindowTitle.statusBar.alignment`     | `"left"`    | Which end of the status bar the badge sits on.                                                                                                     |
| `ntWindowTitle.statusBar.color`         | `"#22D3EE"` | Hex color, or a theme color id such as `terminal.ansiCyan` to follow the active theme.                                                             |
| `ntWindowTitle.statusBar.icon`          | `"window"`  | Codicon shown before the name. Empty for none.                                                                                                     |
| `ntWindowTitle.hud.enabled`             | `false`     | Whether the centered HUD is installed. Prefer the commands above, which explain the consequences first.                                            |
| `ntWindowTitle.hud.showOnWindowOpen`    | `true`      | Also announce shortly after a window opens, not only when it regains focus.                                                                        |
| `ntWindowTitle.hud.displayMilliseconds` | `1100`      | How long the HUD stays visible. Clamped to 200–10000.                                                                                              |
| `ntWindowTitle.hud.position`            | `"center"`  | `center` or `top`.                                                                                                                                 |
| `ntWindowTitle.hud.fontSizePixels`      | `40`        | HUD text size. Clamped to 10–200.                                                                                                                  |
| `ntWindowTitle.hud.uppercase`           | `true`      | Render the HUD name in capitals.                                                                                                                   |
| `ntWindowTitle.hud.color`               | `""`        | Color of the overlay text: a hex color, or a theme color id (`terminal.ansiCyan`) which follows your active theme. Empty reuses `statusBar.color`. |
| `ntWindowTitle.hud.fontFamily`          | `"mono"`    | `ui` inherits the font VS Code uses for its own interface; `mono` uses a monospace stack.                                                          |
| `ntWindowTitle.titleBarPill.enabled`    | `false`     | Show the project name as a filled pill in the title bar.                                                                                           |
| `ntWindowTitle.titleBarPill.position`   | `"right"`   | `right`, `center` or `left`. `right` is where VS Code puts its own Update and Sign in pills.                                                       |
| `ntWindowTitle.titleBarPill.color`      | `""`        | Hex background. Empty uses the theme's button colors, which is what makes it look native. The text color is derived so it stays readable.          |
| `ntWindowTitle.titleBarPill.fontFamily` | `"ui"`      | `ui` uses the same face as the window title beside it, matching the built-in Update and Sign in pills; `mono` uses a monospace stack.              |
| `ntWindowTitle.titleBarPill.bordered`   | `true`      | Outline the pill so it stays visible when your title bar happens to be the same color as it. `false` gives the byte-identical native look.         |
| `ntWindowTitle.titleBarPill.uppercase`  | `false`     | Render the pill text in capitals.                                                                                                                  |

The announced name is the explicit `label` if set, otherwise the open folder's name, otherwise the workspace name for a multi-root workspace. An empty window announces nothing.

## Development

```bash
npm install
npm test      # clean, compile, lint, format check, then Mocha
npm run watch # then F5 in VS Code to launch an Extension Development Host
npm run package
```

`ARCHITECTURE.md` is the canonical design document — read it before changing how the patch or the name channel works.

## Licence

MIT
