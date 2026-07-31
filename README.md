# Window Title nt

**Know which project a VS Code window belongs to, at a glance.**

When you keep a window open per repository, the folder name buried in the title bar is easy to miss. This extension puts the project name in the status bar, in cyan, where it is always visible — and **announces it inside the editor when the window gains focus**, so you notice which project you just switched to without looking away from your code.

That is the whole extension. It holds one status-bar item, one decoration type, three event subscriptions, and **no timer except while an announcement is on screen** — about a second. It performs **no filesystem or network I/O** and has **no runtime dependencies**, and it ships as a single bundled file. Focusing a window redraws the badge and sets one decoration range; the stylesheet is not touched, because the decoration type carries the appearance and is rebuilt only when the project name or your settings change.

Run **Window Title nt: Announce Project Name** to see it without switching windows; it is worth binding to a key if you like it.

### One unsupported thing, on purpose

Decoration attachments expose no `fontSize`. Any `fontSizePercent` above 100 is applied by appending a declaration to `textDecoration`, which VS Code passes through as raw CSS. That is **undocumented behavior**, and it is the only thing in this extension that relies on something Microsoft has not promised.

It is opt-out (`fontSizePercent: 100`) and it fails soft: if a future VS Code escapes those values, the declaration is simply dropped and the announcement renders at the normal editor size. Nothing breaks, nothing is left behind, and your installation is never modified.

Two honest caveats. The announcement needs a **visible text editor** — nothing appears on the Welcome tab or the Settings UI, where the status-bar badge still carries the name. And the status-bar flash uses `statusBarItem.warningBackground`, one of only two background colors VS Code allows on a status-bar item; in themes that rebind `editorWarning.foreground` close to your badge color (Dracula Soft, for one) the flash is nearly invisible. The editor announcement is the one whose color is entirely ours, so it looks the same in every theme.

## Why it does not draw over the window

Earlier versions also flashed the project name over the middle of the window on focus, and showed it as a pill in the title bar. Both are gone as of 2.0.0.

VS Code's extension API has no surface for an overlay or a title-bar entry — verified in VS Code's own source, where the list of menus extensions may contribute to contains no title-bar or command-center id. The only way to draw there is to modify VS Code's `workbench.html`, which the extension used to do.

It worked, and it reverted cleanly, but it made VS Code report **"Your Code installation appears to be corrupt"**, because `workbench.html` is one of the files VS Code checksums. Asking people to accept a corrupt-installation warning, forever, in exchange for a nicer label is not a trade worth offering. So the feature was removed rather than kept behind a flag.

If you want that back, the honest options are a fork of VS Code, or an extension like Custom UI Style that makes the same trade explicitly. This one will not modify your installation.

The supported substitute is a **text-editor decoration**: the project name is drawn at the end of a line in the middle of the viewport for about a second. It is the only surface in the API that renders where you are actually looking without taking focus, changing the editor layout, or leaving anything behind.

Opening a tab and closing it — like the Welcome page appearing on every alt-tab — was considered and rejected. `preserveFocus` stops keyboard focus moving but not the editor swap: VS Code opens the panel with `activation: RESTORE`, so the webview still becomes the visible tab. Every window switch would hide your file and restore it, create and destroy a webview, and churn the tab bar and `Ctrl+Tab` history.

## Settings

| Setting                                            | Default     | Description                                                                                                                                                                          |
| -------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ntWindowTitle.label`                              | `""`        | Name to show instead of the folder name. Set it per project in workspace settings when the folder name is not the name you think in.                                                 |
| `ntWindowTitle.statusBar.enabled`                  | `true`      | Show the badge.                                                                                                                                                                      |
| `ntWindowTitle.statusBar.alignment`                | `"left"`    | Which end of the status bar the badge sits on.                                                                                                                                       |
| `ntWindowTitle.statusBar.color`                    | `"#22D3EE"` | Hex color, or a theme color id such as `terminal.ansiCyan` to follow the active theme.                                                                                               |
| `ntWindowTitle.statusBar.icon`                     | `"window"`  | Codicon shown before the name. Empty for none.                                                                                                                                       |
| `ntWindowTitle.statusBar.flashOnFocus`             | `true`      | Briefly make the badge prominent when the window gains focus.                                                                                                                        |
| `ntWindowTitle.statusBar.flashMilliseconds`        | `1200`      | How long the flash lasts. Clamped to 200–10000.                                                                                                                                      |
| `ntWindowTitle.editorAnnouncement.enabled`         | `true`      | Announce the project name in the editor on focus.                                                                                                                                    |
| `ntWindowTitle.editorAnnouncement.milliseconds`    | `1200`      | How long it stays. Clamped to 200–10000.                                                                                                                                             |
| `ntWindowTitle.editorAnnouncement.color`           | `""`        | Hex color or theme color id. Empty reuses `statusBar.color`.                                                                                                                         |
| `ntWindowTitle.editorAnnouncement.uppercase`       | `true`      | Announce in capitals.                                                                                                                                                                |
| `ntWindowTitle.editorAnnouncement.fontSizePercent` | `220`       | Size as a percentage of the editor font. Clamped to 100–500; 100 disables scaling. See the note below.                                                                               |
| `ntWindowTitle.editorAnnouncement.position`        | `center`    | `center` for the middle of the visible lines, `top` for just below the first. A scaled announcement overflows its line upward, so at the very top the breadcrumb bar paints over it. |

The name shown is the explicit `label` if set; otherwise, in a multi-root workspace, the workspace's own name, falling back to the first root when it has none; otherwise the open folder's name. An empty window shows nothing.

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
