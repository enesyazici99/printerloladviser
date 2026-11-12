// Champion select state from the League client.
//
// Riot's public API does not expose champion select, so there are two local
// sources, both producing the same "session" object:
//  - the desktop app (Tauri) asks the client's local LCU API,
//  - the browser reads the client's own log file, where every update of
//    /lol-champ-select/v1/session is written as one JSON line.
import type { DraftIndex, Team } from "./engine";
import { assignRoles } from "./engine";

export interface SessionPlayer {
  cellId: number;
  championId: number;
  championPickIntent?: number;
  assignedPosition?: string;
}

export interface SessionAction {
  actorCellId: number;
  championId: number;
  completed: boolean;
  type: string;
  isAllyAction?: boolean;
}

export interface ChampSelectSession {
  myTeam: SessionPlayer[];
  theirTeam: SessionPlayer[];
  actions?: SessionAction[][];
  bans?: { myTeamBans?: number[]; theirTeamBans?: number[] };
  localPlayerCellId: number;
  timer?: { phase?: string };
}

const SESSION_MARKER = "/lol-champ-select/v1/session: ";
const POSITION_ROLE: Record<string, number> = { top: 0, jungle: 1, middle: 2, bottom: 3, utility: 4 };

export interface LogSession {
  session: ChampSelectSession;
  /**
   * Seconds between this session update and the newest line of the log. The
   * client keeps writing other lines after a lobby ends, so a large value means
   * the champion select in the log is over. Null when the log has no timestamps.
   */
  age: number | null;
}

/** Every client log line starts with seconds since the client started, e.g. "010116.820|". */
function lineSeconds(text: string, index: number): number | null {
  const start = text.lastIndexOf("\n", index) + 1;
  const m = /^(\d+\.\d+)\|/.exec(text.slice(start, start + 24));
  return m ? Number(m[1]) : null;
}

/** Timestamp of the newest complete line. */
function lastLineSeconds(text: string): number | null {
  let end = text.lastIndexOf("\n");
  for (let i = 0; i < 6 && end > 0; i++) {
    const seconds = lineSeconds(text, end - 1);
    if (seconds != null) return seconds;
    end = text.lastIndexOf("\n", end - 1); // wrapped line without a timestamp: look one line up
  }
  return null;
}

/** Latest champ-select session written to a LeagueClient log, and how long ago it was written. */
export function readSessionFromLog(text: string): LogSession | null {
  let end = text.length;
  // Walk backwards: the newest complete line wins; a half-written last line is skipped.
  for (;;) {
    const at = text.lastIndexOf(SESSION_MARKER, end);
    if (at < 0) return null;
    const start = at + SESSION_MARKER.length;
    const lineEnd = text.indexOf("\n", start);
    const raw = text.slice(start, lineEnd < 0 ? undefined : lineEnd).trim();
    try {
      const session = JSON.parse(raw);
      if (session && Array.isArray(session.myTeam) && Array.isArray(session.theirTeam)) {
        const written = lineSeconds(text, at);
        const newest = lastLineSeconds(text);
        return { session: session as ChampSelectSession, age: written != null && newest != null ? Math.max(0, newest - written) : null };
      }
    } catch {
      // truncated or wrapped line — try the previous one
    }
    end = at - 1;
    if (end < 0) return null;
  }
}

/** Latest champ-select session written to a LeagueClient log (null if there is none). */
export function parseSessionFromLog(text: string): ChampSelectSession | null {
  return readSessionFromLog(text)?.session ?? null;
}

export interface BoardState {
  /** locked-in picks */
  ally: Team;
  enemy: Team;
  /**
   * Champions that are only being shown: a declared intent before the player's
   * turn, or a selection that has not been locked yet. They are displayed but
   * never treated as picks.
   */
  allyHover: Team;
  enemyHover: Team;
  bans: number[];
  /** role index of the local player (null when the client did not assign one) */
  myRole: number | null;
}

/** Translate a client session into the draft board. */
export function sessionToBoard(session: ChampSelectSession, index: DraftIndex | null): BoardState {
  // A pick is final once its "pick" action is completed. Until then the client
  // already puts the hovered champion into `championId`, which is not a pick.
  const actions = (session.actions ?? []).flat();
  const hasPickActions = actions.some((a) => a.type === "pick");
  const lockedBy = new Map<number, number>();
  for (const a of actions) if (a.type === "pick" && a.completed && a.championId > 0) lockedBy.set(a.actorCellId, a.championId);
  // Sessions without pick actions (some custom modes) give no way to tell: take `championId` as picked.
  const lockedOf = (p: SessionPlayer) => (hasPickActions ? (lockedBy.get(p.cellId) ?? 0) : p.championId || 0);
  const shownOf = (p: SessionPlayer) => (lockedOf(p) ? 0 : p.championId || p.championPickIntent || 0);

  const placeLoose = (team: Team, champs: number[]): Team => {
    if (champs.length === 0) return team;
    if (index) return assignRoles(index, champs, team);
    const out = [...team];
    for (const c of champs) {
      const free = out.indexOf(0);
      if (free >= 0) out[free] = c;
    }
    return out;
  };

  // Allies have assigned positions in ranked; without them the role is guessed for locked picks only.
  const ally: Team = [0, 0, 0, 0, 0];
  const allyHover: Team = [0, 0, 0, 0, 0];
  const unplaced: number[] = [];
  let myRole: number | null = null;
  for (const p of session.myTeam) {
    const role = POSITION_ROLE[(p.assignedPosition ?? "").toLowerCase()];
    if (p.cellId === session.localPlayerCellId && role != null) myRole = role;
    const locked = lockedOf(p);
    if (locked) {
      if (role != null && !ally[role]) ally[role] = locked;
      else unplaced.push(locked);
    } else if (role != null && shownOf(p)) allyHover[role] = shownOf(p);
  }
  const allyTeam = placeLoose(ally, unplaced);
  for (let r = 0; r < allyHover.length; r++) if (allyTeam[r]) allyHover[r] = 0;

  // Enemy positions are hidden: guess them from how the champions are played.
  const enemyTeam = placeLoose([0, 0, 0, 0, 0], session.theirTeam.map(lockedOf).filter((c) => c > 0));
  const enemyShown = session.theirTeam.map(shownOf).filter((c) => c > 0 && !enemyTeam.includes(c));
  const enemyHover = placeLoose(enemyTeam, enemyShown).map((c, r) => (enemyTeam[r] ? 0 : c));

  const bans = new Set<number>();
  for (const id of [...(session.bans?.myTeamBans ?? []), ...(session.bans?.theirTeamBans ?? [])]) if (id > 0) bans.add(id);
  for (const a of actions) if (a.type === "ban" && a.completed && a.championId > 0) bans.add(a.championId);

  return { ally: allyTeam, enemy: enemyTeam, allyHover, enemyHover, bans: [...bans], myRole };
}

/** The parts of the File System Access API this module uses (kept minimal so it can be faked in tests). */
export interface LogEntry {
  kind: "file" | "directory";
  name: string;
  getFile?: () => Promise<File>;
}
export interface LogDirectory {
  values(): AsyncIterable<LogEntry>;
  getDirectoryHandle(name: string): Promise<LogDirectory>;
}

/** Newest "*Client.log" directly inside a directory (the Ux and tracing files are not it). */
export async function newestClientLog(dir: LogDirectory): Promise<File | null> {
  const logs: LogEntry[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind === "file" && entry.name.endsWith("Client.log") && entry.getFile) logs.push(entry);
  }
  // File names start with the session's start time, so the last few names are the candidates.
  logs.sort((a, b) => (a.name < b.name ? 1 : -1));
  let newest: File | null = null;
  for (const entry of logs.slice(0, 3)) {
    const file = await entry.getFile!();
    if (!newest || file.lastModified > newest.lastModified) newest = file;
  }
  return newest;
}

/** Folders on the way down to the logs: Riot Games / League of Legends / Logs / LeagueClient Logs. */
const LOG_PATH = ["LeagueClient Logs", "Logs", "League of Legends"];

/**
 * Finds the client log starting from whatever folder the user picked. Picking
 * the game folder or its "Logs" folder works as well as the exact log folder.
 */
export async function findClientLog(dir: LogDirectory): Promise<File | null> {
  let current = dir;
  for (let depth = 0; depth <= LOG_PATH.length; depth++) {
    const file = await newestClientLog(current);
    if (file) return file;
    let next: LogDirectory | null = null;
    for (const name of LOG_PATH) {
      try {
        next = await current.getDirectoryHandle(name);
        break;
      } catch {
        // no such sub-folder here
      }
    }
    if (!next) return null;
    current = next;
  }
  return null;
}

/** Read only the tail of a (possibly large) log file. */
export async function readLogTail(file: File, bytes = 600_000): Promise<string> {
  return file.slice(Math.max(0, file.size - bytes)).text();
}
