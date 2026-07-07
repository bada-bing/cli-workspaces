import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  closeMainWindow,
  getPreferenceValues,
  popToRoot,
  showToast,
  Toast,
} from "@raycast/api";
import { execFile, execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { useEffect, useMemo, useState } from "react";

interface Session {
  name: string;
  description?: string;
  dir?: string;
  color?: string;
}

type SessionStatus = "active" | "exists" | "new";

const HOME = homedir();
const TMUX = "/opt/homebrew/bin/tmux";
const BOOTSTRAP = `${HOME}/Developer/toolbox/scripts/local_development/tmux.bootstrap.sh`;
const WA2_ENV = `${HOME}/Developer/src/raycast-extensions/wa-2/.env`;
const ENV = { PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" };

// ─── config ───────────────────────────────────────────────────────────────────

function parseSessions(): Session[] {
  const { sessionsFile } = getPreferenceValues<ExtensionPreferences>();
  const filePath = sessionsFile.trim().replace(/^~/, HOME);
  const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
  return parsed.map((s: string | Session) => (typeof s === "string" ? { name: s } : s));
}

// ─── tmux ─────────────────────────────────────────────────────────────────────

/** Sessions with at least one attached client, most recently active client first. */
function attachedSessions(): { name: string; activity: number }[] {
  try {
    const out = execSync(`${TMUX} list-clients -F '#{client_activity} #{session_name}' 2>/dev/null`, { env: ENV })
      .toString()
      .trim();
    if (!out) return [];
    return out
      .split("\n")
      .map((line) => {
        const [activity, name] = line.split(" ");
        return { name, activity: Number(activity) };
      })
      .sort((a, b) => b.activity - a.activity);
  } catch {
    return [];
  }
}

/**
 * Session name of the macOS-focused Ghostty tile, delivered asynchronously
 * (osascript costs ~150ms — too slow for the render path). tmux titles each
 * terminal with its session name (set-titles-string "#S" in tmux.conf), so
 * Ghostty's focused-terminal title is the session — even when focus moved by
 * mouse click, which tmux itself cannot observe.
 */
function focusedGhosttySession(callback: (name: string | null) => void): void {
  execFile(
    "osascript",
    ["-e", 'tell application "Ghostty" to name of focused terminal of selected tab of front window'],
    { env: ENV },
    (err, stdout) => callback(err ? null : stdout.trim() || null)
  );
}

function listExistingSessions(): Set<string> {
  try {
    const out = execSync(`${TMUX} list-sessions -F '#{session_name}' 2>/dev/null`, { env: ENV }).toString();
    return new Set(out.trim().split("\n").filter(Boolean));
  } catch {
    return new Set();
  }
}

function sessionDir(session: Session): string {
  return session.dir ?? join(HOME, "Developer", "src", session.name);
}

function ensureSession(session: Session): void {
  const dir = sessionDir(session);
  if (!listExistingSessions().has(session.name)) {
    execSync(`${TMUX} new-session -d -s ${session.name} -c "${dir}"`, { env: ENV });
    if (existsSync(BOOTSTRAP)) {
      execSync(`bash "${BOOTSTRAP}" ${session.name} "${dir}"`, { env: ENV });
    }
  }
}

function syncActiveProject(name: string): void {
  if (existsSync(WA2_ENV)) {
    execSync(`sed -i '' "s/^ACTIVE_PROJECT=.*/ACTIVE_PROJECT=${name}/" "${WA2_ENV}"`, { env: ENV });
  }
}

function openSession(session: Session): void {
  ensureSession(session);
  execSync(`${TMUX} switch-client -t ${session.name} 2>/dev/null || true`, { env: ENV });
  syncActiveProject(session.name);
  execSync(`osascript -e 'tell application "Ghostty" to activate'`, { env: ENV });
}

/**
 * Opens the session in a new Ghostty split (like Cmd+D), attached as its own
 * tmux client. Uses Ghostty's native AppleScript dictionary (1.3+) — no
 * System Events keystroke faking, so it works from a Raycast subprocess.
 */
function openSessionInSplit(session: Session): void {
  ensureSession(session);
  const script = `
    tell application "Ghostty"
      activate
      set cfg to new surface configuration
      set command of cfg to "${TMUX} new-session -A -s ${session.name}"
      if (count of windows) is 0 then
        new window with configuration cfg
      else
        split (focused terminal of selected tab of front window) direction right with configuration cfg
      end if
    end tell`;
  execSync("osascript", { env: ENV, input: script });
  syncActiveProject(session.name);
}

// ─── component ────────────────────────────────────────────────────────────────

export default function Command() {
  const sessions = useMemo(parseSessions, []);
  const existing = useMemo(listExistingSessions, []);
  const attached = useMemo(attachedSessions, []);

  // Initial guess: the most recently active tmux client's session —
  // switch-client targets it, typing bumps it, and a fresh split client
  // starts with attach-time activity. The focused Ghostty tile (which also
  // sees mouse-driven focus changes) is authoritative and corrects the badge
  // when the async osascript query lands, validated against sessions that
  // actually have a client in case the focused tile isn't running tmux.
  const [active, setActive] = useState<string | null>(attached[0]?.name ?? null);
  useEffect(() => {
    focusedGhosttySession((focused) => {
      if (focused && attached.some((s) => s.name === focused)) setActive(focused);
    });
  }, []);

  const statuses: Record<string, SessionStatus> = {};
  for (const s of sessions) {
    if (s.name === active) statuses[s.name] = "active";
    else if (existing.has(s.name)) statuses[s.name] = "exists";
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
            icon={session.color ? { source: "list-icon.png", tintColor: session.color } : "list-icon.png"}
            title={session.name}
            subtitle={session.description}
            accessories={[badge]}
            actions={
              <ActionPanel>
                <Action
                  title="Switch to Session"
                  icon={{ fileIcon: "/Applications/Ghostty.app" }}
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
                <Action
                  title="Open in Split"
                  icon={{ fileIcon: "/Applications/Ghostty.app" }}
                  shortcut={{ modifiers: ["cmd"], key: "d" }}
                  onAction={async () => {
                    try {
                      openSessionInSplit(session);
                    } catch (e) {
                      await showToast({ style: Toast.Style.Failure, title: "Failed", message: String(e) });
                      return;
                    }
                    await popToRoot();
                    await closeMainWindow();
                  }}
                />
                <Action
                  title="Open in Zed"
                  icon={{ fileIcon: "/Applications/Zed.app" }}
                  onAction={() => {
                    execSync(`zed "${sessionDir(session)}"`, { env: ENV });
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
