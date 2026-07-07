# TODO

## Performance

- **Parallel tmux calls** — run `list-sessions` and `activeSessionName` concurrently with `Promise.all` instead of sequentially
- **Cache session state to file** — write existing sessions to a file on every switch; read it on open instead of querying tmux. Fall back to tmux if stale.
- **Lazy status badges** — render the list immediately with unknown statuses, update badges asynchronously once tmux responds

## Features

- ~~**Open in vertical split**~~ — done via Ghostty's native AppleScript dictionary (1.3+): `split (focused terminal of selected tab of front window) direction right with configuration cfg`. No System Events keystrokes needed.
- **Description in JSON** — sessions already support a `description` field shown as subtitle in the list; document this for users adding new sessions
- **Auto-generate colors** — derive hex color from session name using the same algorithm as `tmux_session_color.sh` at runtime, so `color` doesn't need to be set manually in the JSON
