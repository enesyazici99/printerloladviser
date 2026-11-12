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

/** Latest champ-select session written to a LeagueClient log (null if there is none). */
export function parseSessionFromLog(text: string): ChampSelectSession | null {
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
      if (session && Array.isArray(session.myTeam) && Array.isArray(session.theirTeam)) return session as ChampSelectSession;
    } catch {
      // truncated or wrapped line — try the previous one
    }
    end = at - 1;
    if (end < 0) return null;
  }
}

export interface BoardState {
  ally: Team;
  enemy: Team;
  bans: number[];
  /** role index of the local player (null when the client did not assign one) */
  myRole: number | null;
}

/** Translate a client session into the draft board. */
export function sessionToBoard(session: ChampSelectSession, index: DraftIndex | null): BoardState {
  const ally: Team = [0, 0, 0, 0, 0];
  const unplaced: number[] = [];
  let myRole: number | null = null;
  for (const p of session.myTeam) {
    const champ = p.championId || p.championPickIntent || 0;
    const role = POSITION_ROLE[(p.assignedPosition ?? "").toLowerCase()];
    if (p.cellId === session.localPlayerCellId && role != null) myRole = role;
    if (!champ) continue;
    if (role != null && !ally[role]) ally[role] = champ;
    else unplaced.push(champ);
  }
  const enemyChamps = session.theirTeam.map((p) => p.championId).filter((c) => c > 0);
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

  const bans = new Set<number>();
  for (const id of [...(session.bans?.myTeamBans ?? []), ...(session.bans?.theirTeamBans ?? [])]) if (id > 0) bans.add(id);
  for (const set of session.actions ?? []) {
    for (const a of set) if (a.type === "ban" && a.completed && a.championId > 0) bans.add(a.championId);
  }

  return {
    ally: placeLoose(ally, unplaced),
    enemy: placeLoose([0, 0, 0, 0, 0], enemyChamps),
    bans: [...bans],
    myRole,
  };
}

/** Newest "*Client.log" in a directory handle chosen by the user. */
export async function newestClientLog(dir: FileSystemDirectoryHandle): Promise<File | null> {
  let newest: File | null = null;
  // @ts-expect-error — async iteration of directory handles is not in the default DOM typings
  for await (const entry of dir.values()) {
    if (entry.kind !== "file" || !entry.name.endsWith("Client.log")) continue;
    const file: File = await entry.getFile();
    if (!newest || file.lastModified > newest.lastModified) newest = file;
  }
  return newest;
}

/** Read only the tail of a (possibly large) log file. */
export async function readLogTail(file: File, bytes = 600_000): Promise<string> {
  return file.slice(Math.max(0, file.size - bytes)).text();
}
