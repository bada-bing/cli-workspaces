# CLI Workspaces

Raycast extension for focusing or opening CLI workspaces — tmux sessions running inside Ghostty. The list shows every configured workspace with a live status badge; selecting one either switches the current Ghostty tile to that session or opens it in a new split.

## Configuration

Sessions are declared in a JSON file (extension preference `sessionsFile`, default `~/Developer/toolbox/private/env/raycast/cli-workspaces.json`). Each item is either a plain string (the session name) or an object:

```json
[
  "toolbox",
  { "name": "wa-2", "description": "job application manager", "dir": "~/Developer/src/raycast-extensions/wa-2", "color": "#7dcfff" }
]
```

- `name` — tmux session name; doubles as the directory basename when `dir` is omitted (defaults to `~/Developer/src/<name>`)
- `description` — shown as the list subtitle
- `color` — tints the list icon

## Actions

### Switch to Session (Enter)

1. **Ensure the session exists.** If tmux has no session by that name, one is created detached (`tmux new-session -d -s <name> -c <dir>`) and `tmux.bootstrap.sh` sets up the standard window layout (`run`, `edit`).
2. **Retarget the current client.** `tmux switch-client -t <name>` — run without `-c`, which makes tmux pick the *most recently active* client, i.e. the tile you were last working in. The Ghostty tile stays put; only the session displayed inside it changes.
3. Sync `ACTIVE_PROJECT` in the wa-2 extension's `.env`, then activate Ghostty.

### Open in Split (Cmd+D)

Opens the session in a new Ghostty split next to the current tile — same effect as pressing Cmd+D inside Ghostty, but the new tile comes up attached to the chosen session.

This uses Ghostty's native AppleScript dictionary (Ghostty ≥ 1.3, see `Ghostty.sdef` in the app bundle) rather than synthesized keystrokes. Faking Cmd+D via System Events needs the Accessibility permission and proved unreliable from a Raycast subprocess; real Apple events only need the one-time Automation permission ("Raycast wants to control Ghostty") and are deterministic. The script:

```applescript
tell application "Ghostty"
  set cfg to new surface configuration
  set command of cfg to "tmux new-session -A -s <name>"
  split (focused terminal of selected tab of front window) direction right with configuration cfg
end tell
```

The surface configuration replaces the shell in the new tile with `tmux new-session -A`, which attaches to the session or creates it (it always exists at this point — step 1 above runs first). If Ghostty has no window at all, a new window is created instead of a split.

Each split is its own tmux *client*. Opening a session that is already visible in another tile mirrors it (normal tmux multi-client behavior); the feature is meant for viewing two different sessions side by side.

### Open in Zed

Opens the session's directory in Zed. No tmux involvement.

## Status badges — how "active" is detected

Each session shows one of three states:

- 🟢 **active** — the session in the Ghostty tile you are focused in
- 🟡 **exists** — session is running on the tmux server, not focused
- ⚪ **new** — no such session yet; selecting it creates one

**exists** is a plain `tmux list-sessions` lookup. **active** is the interesting one, because two different systems each hold half of the answer:

- tmux knows which session every client displays, but cannot see macOS focus — clicking from one Ghostty tile to another produces no tmux event at all.
- Ghostty knows exactly which tile has focus, but knows nothing about tmux — a tile is just a terminal with a title.

The bridge is the terminal title. tmux **requires** these two settings in `tmux.conf` (without them every tile is titled "👻" and focus detection falls back to the client-activity heuristic):

```
set -g set-titles on          # announce a title to the outer terminal
set -g set-titles-string "#S" # the title is the session name
```

How this works mechanically: each Ghostty tile is its own PTY, and titles travel *in-band* on that PTY as an OSC 2 escape sequence (`ESC ] 2 ; <title> BEL`) — the same mechanism as `printf '\033]2;hello\007'` in a bare shell. With `set-titles on`, the tmux client attached in a tile emits that sequence carrying its session name, and re-emits it on attach, session switch, or rename. Ghostty's VT parser stores the string as that surface's title. No coordination is needed for per-tile correctness: the announcement can only travel through the one PTY of the tile whose client sent it.

So the full chain: tmux client announces its session name in-band per PTY → Ghostty parses and stores it per surface → AppleScript reads back the title of the focused surface. `set-titles on` merely turns on the announcing; everything else already existed.

The extension asks Ghostty for the focused tile's title via AppleScript:

```applescript
tell application "Ghostty" to name of focused terminal of selected tab of front window
```

and that answer *is* the focused session name — correct even after mouse-only focus changes. The value is validated against sessions that actually have an attached client, so a tile not running tmux (title wouldn't match any session) falls through to the fallback.

**Fallback:** the session of the most recently active tmux client, from `tmux list-clients` sorted by `client_activity`. This is right whenever the last thing you did was type or switch sessions; it only misses the click-without-typing case that the Ghostty query covers. It also covers Ghostty being closed or the AppleScript failing.

Earlier versions tracked the active session in a state file written by a `client-session-changed` tmux hook. That broke once splits made multiple clients normal: no tmux event fires when a client *detaches* (a split closes) or a session is killed, so the file went stale and pointed at the previously selected session. Everything the file recorded is derivable live from `list-clients`, so the file and hook were removed.

## Rendering performance

The osascript round trip to Ghostty costs ~150 ms; the tmux queries cost ~7 ms. So the render path is tmux-only: the list appears immediately with the active badge from the client-activity fallback (usually already correct), and the Ghostty focus query runs asynchronously in a `useEffect`, correcting the badge when it lands. The tmux lookups are memoized so the badge update doesn't re-spawn processes.

## External touchpoints

| Dependency | Role |
|---|---|
| `tmux` (`/opt/homebrew/bin/tmux`) | session backend; must be on the hardcoded PATH |
| Ghostty ≥ 1.3 | AppleScript dictionary for `split` and focused-terminal queries |
| `tmux.bootstrap.sh` (toolbox) | standard window layout for newly created sessions |
| `set-titles` in `tmux.conf` (toolbox dotfiles) | title bridge for focus detection |
| wa-2 `.env` | `ACTIVE_PROJECT` is updated on every open/split |
