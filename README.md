# Window Title nt

**Know which project a VS Code window belongs to, at a glance.**

When you keep a window open per repository, the folder name buried in the title bar is easy to miss. This extension puts the project name in the status bar, in cyan, where it is always visible — and **briefly makes it prominent when the window gains focus**, so you notice which project you just switched to.

That is the whole extension. It holds one status-bar item, three event subscriptions, and **no timer except while a flash is on screen** — about a second. It performs **no filesystem or network I/O** and has **no runtime dependencies**. The badge is recomputed only when the workspace folders or its own settings change.

## Why it does not draw over the window

Earlier versions also flashed the project name over the middle of the window on focus, and showed it as a pill in the title bar. Both are gone as of 2.0.0.

VS Code's extension API has no surface for an overlay or a title-bar entry — verified in VS Code's own source, where the list of menus extensions may contribute to contains no title-bar or command-center id. The only way to draw there is to modify VS Code's `workbench.html`, which the extension used to do.

It worked, and it reverted cleanly, but it made VS Code report **"Your Code installation appears to be corrupt"**, because `workbench.html` is one of the files VS Code checksums. Asking people to accept a corrupt-installation warning, forever, in exchange for a nicer label is not a trade worth offering. So the feature was removed rather than kept behind a flag.

If you want that back, the honest options are a fork of VS Code, or an extension like Custom UI Style that makes the same trade explicitly. This one will not modify your installation.

The focus flash is the supported substitute: it uses `statusBarItem.warningBackground`, one of only two background colors VS Code honours on a status-bar item, so the badge becomes a filled pill for a moment. That means the flash colour comes from your theme rather than from `statusBar.color`.

## Settings

| Setting                                     | Default     | Description                                                                                                                          |
| ------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `ntWindowTitle.label`                       | `""`        | Name to show instead of the folder name. Set it per project in workspace settings when the folder name is not the name you think in. |
| `ntWindowTitle.statusBar.enabled`           | `true`      | Show the badge.                                                                                                                      |
| `ntWindowTitle.statusBar.alignment`         | `"left"`    | Which end of the status bar the badge sits on.                                                                                       |
| `ntWindowTitle.statusBar.color`             | `"#22D3EE"` | Hex color, or a theme color id such as `terminal.ansiCyan` to follow the active theme.                                               |
| `ntWindowTitle.statusBar.icon`              | `"window"`  | Codicon shown before the name. Empty for none.                                                                                       |
| `ntWindowTitle.statusBar.flashOnFocus`      | `true`      | Briefly make the badge prominent when the window gains focus.                                                                        |
| `ntWindowTitle.statusBar.flashMilliseconds` | `1200`      | How long the flash lasts. Clamped to 200–10000.                                                                                      |

The name shown is the explicit `label` if set, otherwise the open folder's name, otherwise the workspace name for a multi-root workspace. An empty window shows nothing.

## Development

```bash
npm install   # also points core.hooksPath at .githooks
npm test      # clean, compile, lint, format check, then Mocha
npm run watch # then F5 in VS Code to launch an Extension Development Host
npm run package
```

`pre-commit` type-checks, lints and checks formatting. `pre-push` runs the full suite.

## Licence

MIT
