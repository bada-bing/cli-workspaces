import { Action, ActionPanel, Color, Icon, List, closeMainWindow, getPreferenceValues, popToRoot, showToast, Toast } from "@raycast/api";
import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

interface Session {
  name: string;
  description?: string;
  dir?: string; // working directory for new sessions; defaults to ~/Developer/src/<name>
}

type SessionStatus = "active" | "exists" | "new";

const HOME = homedir();
const TMUX = "/opt/homebrew/bin/tmux";
const BOOTSTRAP = `${HOME}/Developer/toolbox/scripts/local_development/tmux.bootstrap.sh`;
const WA2_ENV = `${HOME}/Developer/src/raycast-extensions/wa-2/.env`;
const STATE_DIR = join(HOME, ".local", "share", "cli-workspaces");
const ACTIVE_SESSION_FILE = join(STATE_DIR, "active-session");
const ENV = { PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" };

// ─── config ───────────────────────────────────────────────────────────────────

function parseSessions(): Session[] {
  const { sessions } = getPreferenceValues<ExtensionPreferences>();
  try {
    const parsed = JSON.parse(sessions);
    if (Array.isArray(parsed)) return parsed.map((s) => (typeof s === "string" ? { name: s } : s));
  } catch {
    // not JSON
  }
  return sessions
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

// ─── tmux ─────────────────────────────────────────────────────────────────────

/**
 * Installs a tmux hook that writes the current session name to a file on every
 * client-session-changed event. This covers all ways of switching sessions:
 * switch-client, choose-session, this extension, tmux_sessionizer, etc.
 * The hook persists for the lifetime of the tmux server; we re-register it on
 * each command open so it survives server restarts.
 */
function ensureHook(): void {
  try {
    if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
    execSync(
      `${TMUX} set-hook -g client-session-changed 'run-shell "echo \#{session_name} > ${ACTIVE_SESSION_FILE}"'`,
      { env: ENV }
    );
  } catch {
    // tmux not running yet — ignore
  }
}

function activeSessionName(): string | null {
  if (existsSync(ACTIVE_SESSION_FILE)) {
    const name = readFileSync(ACTIVE_SESSION_FILE, "utf-8").trim();
    if (name) return name;
  }
  // Fallback for first run before the hook has ever fired: ask tmux directly.
  // With one Ghostty window there is exactly one client, so this is unambiguous.
  try {
    const name = execSync(`${TMUX} list-clients -F '#{session_name}' 2>/dev/null`, { env: ENV })
      .toString().trim().split("\n")[0];
    if (name) return name;
  } catch { /* ignore */ }
  return null;
}

function sessionExists(name: string): boolean {
  try {
    execSync(`${TMUX} has-session -t=${name} 2>/dev/null`, { env: ENV });
    return true;
  } catch {
    return false;
  }
}

function openSession(session: Session): void {
  const dir = session.dir ?? join(HOME, "Developer", "src", session.name);

  if (!sessionExists(session.name)) {
    execSync(`${TMUX} new-session -d -s ${session.name} -c "${dir}"`, { env: ENV });
    if (existsSync(BOOTSTRAP)) {
      execSync(`bash "${BOOTSTRAP}" ${session.name} "${dir}"`, { env: ENV });
    }
  }

  execSync(`${TMUX} switch-client -t ${session.name} 2>/dev/null || true`, { env: ENV });

  // switch-client triggers the hook asynchronously; write the file ourselves
  // immediately so the next open reflects the correct state without any race.
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(ACTIVE_SESSION_FILE, session.name, "utf-8");

  if (existsSync(WA2_ENV)) {
    execSync(`sed -i '' "s/^ACTIVE_PROJECT=.*/ACTIVE_PROJECT=${session.name}/" "${WA2_ENV}"`, { env: ENV });
  }

  execSync(`osascript -e 'tell application "Ghostty" to activate'`, { env: ENV });
}

// ─── component ────────────────────────────────────────────────────────────────

export default function Command() {
  ensureHook();

  const sessions = parseSessions();
  const active = activeSessionName();
  const statuses: Record<string, SessionStatus> = {};
  for (const s of sessions) {
    if (s.name === active) statuses[s.name] = "active";
    else if (sessionExists(s.name)) statuses[s.name] = "exists";
    else statuses[s.name] = "new";
  }

  return (
    <List>
      {sessions.map((session) => {
        const status: SessionStatus = statuses[session.name] ?? "new";
        const badge =
          status === "active"
            ? { icon: { source: Icon.CircleFilled, tintColor: Color.Green }, tooltip: "active" }
            : status === "exists"
              ? { icon: { source: Icon.CircleFilled, tintColor: Color.Yellow }, tooltip: "exists" }
              : { icon: { source: Icon.Circle, tintColor: Color.SecondaryText }, tooltip: "new" };
        return (
          <List.Item
            key={session.name}
            icon="list-icon.png"
            title={session.name}
            subtitle={session.description}
            accessories={[badge]}
            actions={
              <ActionPanel>
                <Action
                  title="Switch to Session"
                  icon={Icon.Terminal}
                  onAction={async () => {
                    try {
                      openSession(session);
                    } catch (e) {
                      await showToast({ style: Toast.Style.Failure, title: "Failed", message: String(e) });
                      return;
                    }
                    await popToRoot();
                    await closeMainWindow();
                  }}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
