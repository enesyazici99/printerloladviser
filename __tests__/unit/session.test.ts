import { describe, expect, it } from "vitest";
import { buildIndex } from "@/lib/draft/engine";
import { findClientLog, newestClientLog, parseSessionFromLog, readSessionFromLog, sessionToBoard, type ChampSelectSession, type LogDirectory } from "@/lib/draft/session";
import { DRAFT } from "./helpers";

const index = buildIndex(DRAFT);

export const session = (over: Partial<ChampSelectSession> = {}): ChampSelectSession => ({
  localPlayerCellId: 2,
  myTeam: [
    { cellId: 0, championId: 54, assignedPosition: "top" },
    { cellId: 1, championId: 0, championPickIntent: 64, assignedPosition: "jungle" },
    { cellId: 2, championId: 0, assignedPosition: "middle" },
    { cellId: 3, championId: 51, assignedPosition: "bottom" },
    { cellId: 4, championId: 0, assignedPosition: "utility" },
  ],
  theirTeam: [
    { cellId: 5, championId: 222 },
    { cellId: 6, championId: 103 },
    { cellId: 7, championId: 0 },
    { cellId: 8, championId: 0 },
    { cellId: 9, championId: 0 },
  ],
  actions: [
    [
      { actorCellId: 0, championId: 238, completed: true, type: "ban", isAllyAction: true },
      { actorCellId: 5, championId: 92, completed: true, type: "ban", isAllyAction: false },
      { actorCellId: 1, championId: 89, completed: false, type: "ban", isAllyAction: true },
    ],
    [{ actorCellId: 0, championId: 54, completed: true, type: "pick", isAllyAction: true }],
  ],
  bans: { myTeamBans: [], theirTeamBans: [] },
  timer: { phase: "BAN_PICK" },
  ...over,
});

/** A log line in the format the League client writes (timestamp| level| source| message). */
const logLine = (s: ChampSelectSession, at = "000557.706") => `${at}|   OKAY|    rcp-be-lol-champ-select| /lol-champ-select/v1/session: ${JSON.stringify(s)}`;

describe("parseSessionFromLog", () => {
  it("returns null when the log has no champion select", () => {
    expect(parseSessionFromLog("000001.000|   OKAY| rcp-be-lol-login| Login completed\n")).toBeNull();
    expect(parseSessionFromLog("")).toBeNull();
  });
  it("reads the session from a client log line", () => {
    const text = `000100.000|   OKAY| something| else\n${logLine(session())}\n000558.000|   OKAY| other| line\n`;
    const parsed = parseSessionFromLog(text);
    expect(parsed?.localPlayerCellId).toBe(2);
    expect(parsed?.myTeam).toHaveLength(5);
  });
  it("uses the newest of several updates", () => {
    const newer = session({ theirTeam: [{ cellId: 5, championId: 222 }, { cellId: 6, championId: 103 }, { cellId: 7, championId: 412 }] });
    const parsed = parseSessionFromLog(`${logLine(session(), "000557.000")}\n${logLine(newer, "000561.000")}\n`);
    expect(parsed?.theirTeam.map((p) => p.championId)).toEqual([222, 103, 412]);
  });
  it("skips a half-written last line and falls back to the previous update", () => {
    const text = `${logLine(session())}\n${logLine(session()).slice(0, 200)}`;
    expect(parseSessionFromLog(text)?.myTeam).toHaveLength(5);
  });
  it("handles Windows line endings", () => {
    expect(parseSessionFromLog(`${logLine(session())}\r\n`)?.localPlayerCellId).toBe(2);
  });
  it("ignores lines whose JSON is not a session", () => {
    expect(parseSessionFromLog(`0|OKAY|x| /lol-champ-select/v1/session: {"foo":1}\n`)).toBeNull();
  });
});

describe("readSessionFromLog", () => {
  it("reports how long ago the session was written, from the log's own timestamps", () => {
    const text = `${logLine(session(), "000557.706")}\n000560.200|   OKAY| rcp-be-lol-chat| presence\n`;
    expect(readSessionFromLog(text)?.age).toBeCloseTo(2.494, 3);
  });
  it("shows a large age once the client has moved on after the lobby", () => {
    const text = `${logLine(session(), "000557.706")}\n003600.000|   OKAY| rcp-be-lol-gameflow| game ended\n`;
    expect(readSessionFromLog(text)?.age).toBeGreaterThan(3000);
  });
  it("is zero when the session is the newest line", () => {
    expect(readSessionFromLog(`${logLine(session())}\n`)?.age).toBe(0);
  });
  it("skips wrapped lines without a timestamp when looking for the newest line", () => {
    const text = `${logLine(session(), "000100.000")}\n000130.000|   OKAY| x| first part of a long\nline that wrapped\n`;
    expect(readSessionFromLog(text)?.age).toBe(30);
  });
  it("has no age for text without timestamps", () => {
    expect(readSessionFromLog(`/lol-champ-select/v1/session: ${JSON.stringify(session())}\n`)?.age).toBeNull();
  });
});

/** Fake File System Access directory: { name: content | sub-directory }. */
type Tree = { [name: string]: string | Tree | { text: string; modified: number } };
function fakeDir(tree: Tree): LogDirectory {
  return {
    async *values() {
      for (const [name, value] of Object.entries(tree)) {
        if (typeof value === "string" || "text" in value) {
          const text = typeof value === "string" ? value : (value.text as string);
          const modified = typeof value === "string" ? 1000 : (value.modified as number);
          yield { kind: "file" as const, name, getFile: async () => new File([text], name, { lastModified: modified }) };
        } else yield { kind: "directory" as const, name };
      }
    },
    async getDirectoryHandle(name: string) {
      const value = tree[name];
      if (!value || typeof value === "string" || "text" in value) throw new Error("NotFoundError");
      return fakeDir(value as Tree);
    },
  };
}

describe("finding the client log", () => {
  const logs: Tree = {
    "2026-11-11T23-03-13_16036_LeagueClient.log": { text: "old", modified: 1000 },
    "2026-11-12T12-26-36_19580_LeagueClient.log": { text: "current", modified: 5000 },
    "2026-11-12T12-26-36_19580_2848_LeagueClientUx.log": { text: "ux", modified: 9000 },
    "2026-11-12T12-26-36_19580_LeagueClient-tracing.json": { text: "{}", modified: 9000 },
  };
  it("picks the newest LeagueClient.log and ignores the Ux and tracing files", async () => {
    const file = await newestClientLog(fakeDir(logs));
    expect(file?.name).toBe("2026-11-12T12-26-36_19580_LeagueClient.log");
    expect(await file?.text()).toBe("current");
  });
  it("returns null for a folder without client logs", async () => {
    expect(await newestClientLog(fakeDir({ "notes.txt": "x" }))).toBeNull();
    expect(await findClientLog(fakeDir({ "notes.txt": "x", Other: {} }))).toBeNull();
  });
  it("works when the exact log folder is chosen", async () => {
    expect((await findClientLog(fakeDir(logs)))?.name).toContain("19580_LeagueClient.log");
  });
  it("works when the Logs folder, the game folder or the Riot Games folder is chosen", async () => {
    const logsFolder: Tree = { GameLogs: {}, "LeagueClient Logs": logs };
    const game: Tree = { Config: {}, Logs: logsFolder, "LeagueClient.exe": "" };
    const riot: Tree = { "Riot Client": {}, "League of Legends": game };
    for (const tree of [logsFolder, game, riot]) {
      expect((await findClientLog(fakeDir(tree)))?.name).toContain("19580_LeagueClient.log");
    }
  });
});

describe("sessionToBoard", () => {
  const board = sessionToBoard(session(), index);
  it("places allies by their assigned position and shows hover intent", () => {
    expect(board.ally).toEqual([54, 64, 0, 51, 0]);
  });
  it("finds the local player's role", () => {
    expect(board.myRole).toBe(2);
  });
  it("guesses enemy roles from how the champions are played", () => {
    expect(board.enemy).toEqual([0, 0, 103, 222, 0]);
  });
  it("collects completed bans only", () => {
    expect([...board.bans].sort((a, b) => a - b)).toEqual([92, 238]);
  });
  it("also reads the bans summary object", () => {
    const b = sessionToBoard(session({ actions: [], bans: { myTeamBans: [1, 0], theirTeamBans: [134] } }), index);
    expect([...b.bans].sort((a, b2) => a - b2)).toEqual([1, 134]);
  });
  it("works for blind lobbies without positions", () => {
    const s = session({
      localPlayerCellId: 0,
      myTeam: [
        { cellId: 0, championId: 103, assignedPosition: "" },
        { cellId: 1, championId: 64, assignedPosition: "" },
      ],
    });
    const b = sessionToBoard(s, index);
    expect(b.myRole).toBeNull();
    expect(b.ally).toEqual([0, 64, 103, 0, 0]);
  });
  it("still fills slots when no statistics are loaded", () => {
    const b = sessionToBoard(session(), null);
    expect(b.enemy.filter(Boolean).sort((a, b2) => a - b2)).toEqual([103, 222]);
  });
});
