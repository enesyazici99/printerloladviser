import { expect, test, type Page } from "@playwright/test";
import { loadDraft, loadStatic, watchErrors } from "./support";
import type { DraftFile } from "../../lib/types";

/** Most played champion ids of a role (0 top … 4 support). */
function topOfRole(draft: DraftFile, role: number, n: number): number[] {
  return Object.entries(draft.base)
    .map(([id, roles]) => ({ id: Number(id), g: roles[role]?.[0] ?? 0 }))
    .sort((a, b) => b.g - a.g)
    .slice(0, n)
    .map((x) => x.id);
}

const slot = (page: Page, side: "ally" | "enemy", role: string) => page.getByTestId(`slot-${side}-${role}`);

async function pickInto(page: Page, side: "ally" | "enemy", role: string, name: string, key: string) {
  await slot(page, side, role).getByRole("button", { name: new RegExp(side === "ally" ? "Takımım" : "Rakip Takım") }).click();
  const picker = page.getByTestId("champion-picker");
  await picker.getByRole("textbox").fill(name);
  await picker.locator(`button[data-champion="${key}"]`).click();
  await expect(picker).toHaveCount(0);
}

test.describe("draft assistant", () => {
  test("starts empty with blind-pick suggestions for the user's role", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("draft/");
    await expect(page.getByTestId("draft-board")).toBeVisible();
    await expect(page.locator('[data-testid^="slot-"][data-champion=""]')).toHaveCount(10);
    await expect(page.getByTestId("suggestion").first()).toBeVisible();
    await expect(page.getByTestId("suggestions")).toContainText("güvenli (kör) seçimler");
    await expect(page.getByTestId("win-chance")).toHaveCount(0);
    await expect(page.getByTestId("build-panel-empty")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("picking champions updates the board, link, win chance, suggestions and build", async ({ page, request }) => {
    const [draft, stat] = await Promise.all([loadDraft(request), loadStatic(request)]);
    const [mine, theirs] = topOfRole(draft, 2, 2).map((id) => stat.champions[id]);
    await page.goto("draft/");

    await pickInto(page, "ally", "mid", mine.name, mine.key);
    await expect(slot(page, "ally", "mid")).toHaveAttribute("data-champion", String(mine.id));
    await expect(slot(page, "ally", "mid")).toContainText(mine.name);
    await expect(page).toHaveURL(new RegExp(`a=\\.\\.${mine.id}\\.\\.`));
    await expect(page.getByTestId("win-chance")).toBeVisible();
    await expect(page.getByTestId("build-panel")).toHaveAttribute("data-champion", String(mine.id));
    await expect(page.getByTestId("build-basis")).toContainText("pro maçından");

    await pickInto(page, "enemy", "mid", theirs.name, theirs.key);
    await expect(slot(page, "enemy", "mid")).toHaveAttribute("data-champion", String(theirs.id));
    // Lane opponent known: the blind-pick note disappears and the build is based on that matchup.
    await expect(page.getByTestId("suggestions")).not.toContainText("güvenli (kör) seçimler");
    const chance = parseFloat((await page.getByTestId("win-chance-ally").innerText()).replace("%", ""));
    expect(chance).toBeGreaterThan(20);
    expect(chance).toBeLessThan(80);

    // Picked champions are never suggested.
    const suggested = await page.getByTestId("suggestion").evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.champion)));
    expect(suggested.length).toBeGreaterThan(3);
    expect(suggested).not.toContain(mine.id);
    expect(suggested).not.toContain(theirs.id);
  });

  test("a suggestion can be picked with one click", async ({ page }) => {
    await page.goto("draft/?r=1");
    const first = page.getByTestId("suggestion").first();
    const id = await first.getAttribute("data-champion");
    await first.getByRole("button", { name: "Seç" }).click();
    await expect(slot(page, "ally", "jungle")).toHaveAttribute("data-champion", id!);
    await expect(page.locator(`[data-testid="suggestion"][data-champion="${id}"]`)).toHaveCount(0);
  });

  test("a champion can only be in one place", async ({ page, request }) => {
    const [draft, stat] = await Promise.all([loadDraft(request), loadStatic(request)]);
    const c = stat.champions[topOfRole(draft, 0, 1)[0]];
    await page.goto(`draft/?a=${c.id}....&r=0`);
    await expect(slot(page, "ally", "top")).toHaveAttribute("data-champion", String(c.id));

    // The picker greys it out…
    await slot(page, "enemy", "top").getByRole("button", { name: /Rakip Takım/ }).click();
    const picker = page.getByTestId("champion-picker");
    await picker.getByRole("textbox").fill(c.name);
    await expect(picker.locator(`button[data-champion="${c.key}"]`)).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);

    // …in the ban picker too.
    await page.getByTestId("add-ban").click();
    await expect(picker.locator(`button[data-champion="${c.key}"]`)).toBeDisabled();
    await page.keyboard.press("Escape");
  });

  test("bans: add, suggest, remove", async ({ page, request }) => {
    const [draft, stat] = await Promise.all([loadDraft(request), loadStatic(request)]);
    const c = stat.champions[topOfRole(draft, 3, 1)[0]];
    await page.goto("draft/?r=3");
    await page.getByTestId("add-ban").click();
    const picker = page.getByTestId("champion-picker");
    await picker.getByRole("textbox").fill(c.name);
    await picker.getByRole("textbox").press("Enter"); // Enter picks the first result
    await expect(page.getByTestId("bans").locator(`[data-ban="${c.id}"]`)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`b=${c.id}`));
    await expect(page.locator(`[data-testid="suggestion"][data-champion="${c.id}"]`)).toHaveCount(0);

    await page.getByTestId("tab-bans").click();
    const suggestion = page.getByTestId("ban-suggestion").first();
    const banId = await suggestion.getAttribute("data-champion");
    expect(Number(banId)).not.toBe(c.id);
    await suggestion.getByRole("button", { name: "Ban" }).click();
    await expect(page.getByTestId("bans").locator(`[data-ban="${banId}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="ban-suggestion"][data-champion="${banId}"]`)).toHaveCount(0);

    await page.getByTestId("bans").locator(`[data-ban="${c.id}"]`).click();
    await expect(page.getByTestId("bans").locator(`[data-ban="${c.id}"]`)).toHaveCount(0);
  });

  test("a shared link restores the whole draft", async ({ page, request }) => {
    const [draft, stat] = await Promise.all([loadDraft(request), loadStatic(request)]);
    const ally = [0, 1, 2, 3, 4].map((r) => topOfRole(draft, r, 1)[0]);
    const enemy = [0, 1, 2, 3, 4].map((r) => topOfRole(draft, r, 3).find((id) => !ally.includes(id))!);
    const ban = topOfRole(draft, 2, 8).find((id) => !ally.includes(id) && !enemy.includes(id))!;
    await page.goto(`draft/?a=${ally.join(".")}&e=${enemy.join(".")}&b=${ban}&r=4`);
    const roles = ["top", "jungle", "mid", "adc", "support"];
    for (let i = 0; i < 5; i++) {
      await expect(slot(page, "ally", roles[i])).toHaveAttribute("data-champion", String(ally[i]));
      await expect(slot(page, "enemy", roles[i])).toHaveAttribute("data-champion", String(enemy[i]));
    }
    await expect(page.getByTestId("bans").locator(`[data-ban="${ban}"]`)).toBeVisible();
    await expect(page.getByTestId("my-role-support")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("build-panel")).toHaveAttribute("data-champion", String(ally[4]));
    await expect(page.getByTestId("comp-ally")).toContainText("Hasar dağılımı");
    await expect(page.getByTestId("comp-enemy")).toContainText("Hasar dağılımı");
    // Full enemy team: nothing left to ban.
    await page.getByTestId("tab-bans").click();
    await expect(page.getByTestId("ban-suggestion")).toHaveCount(0);

    await page.getByTestId("reset").click();
    await expect(page.locator('[data-testid^="slot-"][data-champion=""]')).toHaveCount(10);
    await expect(page.getByTestId("bans").locator("[data-ban]")).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("a")).toBeNull();
  });

  test("my role changes the suggestions and survives a reload", async ({ page }) => {
    await page.goto("draft/");
    await page.getByTestId("my-role-support").click();
    await expect(page.getByTestId("my-role-support")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("suggest-role-support")).toHaveAttribute("aria-pressed", "true");
    const supports = await page.getByTestId("suggestion").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.champion));
    await page.getByTestId("suggest-role-top").click();
    const tops = await page.getByTestId("suggestion").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.champion));
    expect(tops.slice(0, 5)).not.toEqual(supports.slice(0, 5));
    await page.goto("draft/");
    await expect(page.getByTestId("my-role-support")).toHaveAttribute("aria-pressed", "true");
  });

  test("champion pool limits the suggestions", async ({ page, request }) => {
    const stat = await loadStatic(request);
    await page.goto("draft/?r=2");
    await expect(page.getByTestId("only-pool")).toBeDisabled();
    const ids = await page.getByTestId("suggestion").evaluateAll((els) => els.slice(2, 4).map((e) => (e as HTMLElement).dataset.champion!));
    await page.getByTestId("add-pool").click();
    const picker = page.getByTestId("champion-picker");
    for (const id of ids) {
      await picker.getByRole("textbox").fill(stat.champions[id].name);
      await picker.locator(`button[data-champion="${stat.champions[id].key}"]`).click(); // the picker stays open for several picks
    }
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("settings").locator("[data-pool]")).toHaveCount(2);
    await page.getByTestId("only-pool").check();
    const limited = await page.getByTestId("suggestion").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.champion!));
    expect(limited.sort()).toEqual([...ids].sort());
    // The pool is a preference: it is still there after a reload.
    await page.reload();
    await expect(page.getByTestId("settings").locator("[data-pool]")).toHaveCount(2);
    await page.getByTestId("settings").locator("[data-pool]").first().click();
    await expect(page.getByTestId("settings").locator("[data-pool]")).toHaveCount(1);
  });

  test("data confidence setting re-scores suggestions", async ({ page }) => {
    await page.goto("draft/?r=2");
    const score = () => page.getByTestId("suggestion").first().locator("span.text-base").innerText();
    await page.locator('button[data-risk="safe"]').click();
    const safe = await score();
    await page.locator('button[data-risk="bold"]').click();
    await expect(page.locator('button[data-risk="bold"]')).toHaveAttribute("aria-pressed", "true");
    const bold = await score();
    expect(Math.abs(parseFloat(bold.replace("−", "-")))).toBeGreaterThanOrEqual(Math.abs(parseFloat(safe.replace("−", "-"))));
  });

  test("warns about a one-sided composition", async ({ page, request }) => {
    const stat = await loadStatic(request);
    const draft = await loadDraft(request);
    // Five physical-damage champions, one per role where possible.
    const adByRole: number[] = [];
    for (let r = 0; r < 5; r++) {
      const id = topOfRole(draft, r, 60).find((c) => stat.champions[c]?.dmg === "ad" && !adByRole.includes(c));
      if (id) adByRole.push(id);
    }
    test.skip(adByRole.length < 5, "not enough physical-damage champions in the data");
    await page.goto(`draft/?a=${adByRole.join(".")}`);
    await expect(page.getByTestId("comp-ally").getByTestId("comp-warning").first()).toContainText("fiziksel");
    await expect(page.getByTestId("comp-ally")).toContainText("Fiziksel 100%");
  });

  test("live sync fills the board from a League client log file", async ({ page, request }) => {
    const [draft, stat] = await Promise.all([loadDraft(request), loadStatic(request)]);
    const top = topOfRole(draft, 0, 1)[0];
    const adc = topOfRole(draft, 3, 2);
    const mid = topOfRole(draft, 2, 3).find((id) => id !== top && !adc.includes(id))!;
    const banned = topOfRole(draft, 1, 1)[0];
    const session = {
      localPlayerCellId: 3,
      myTeam: [
        { cellId: 0, championId: top, assignedPosition: "top" },
        { cellId: 1, championId: 0, assignedPosition: "jungle" },
        { cellId: 2, championId: 0, championPickIntent: mid, assignedPosition: "middle" },
        { cellId: 3, championId: 0, assignedPosition: "bottom" },
        { cellId: 4, championId: 0, assignedPosition: "utility" },
      ],
      theirTeam: [{ cellId: 5, championId: adc[1] }, { cellId: 6, championId: 0 }],
      actions: [[{ actorCellId: 0, championId: banned, completed: true, type: "ban", isAllyAction: true }]],
      bans: { myTeamBans: [], theirTeamBans: [] },
      timer: { phase: "BAN_PICK" },
    };
    const log = [
      "000001.000|   OKAY|          rcp-be-lol-login| Login session created",
      `000557.706|   OKAY|    rcp-be-lol-champ-select| /lol-champ-select/v1/session: ${JSON.stringify(session)}`,
      "000558.100|   OKAY|          rcp-be-lol-chat| presence update",
    ].join("\r\n");

    await page.goto("draft/");
    await page.getByTestId("live-sync").getByRole("button").first().click();
    await page.getByTestId("log-file-input").setInputFiles({ name: "2026-11-12T10-00-00_1234_LeagueClient.log", mimeType: "text/plain", buffer: Buffer.from(log) });
    await expect(page.getByTestId("sync-live")).toBeVisible();
    await expect(slot(page, "ally", "top")).toHaveAttribute("data-champion", String(top));
    await expect(slot(page, "ally", "mid")).toHaveAttribute("data-champion", String(mid)); // hover intent
    await expect(slot(page, "enemy", "adc")).toHaveAttribute("data-champion", String(adc[1])); // role guessed from play rates
    await expect(page.getByTestId("bans").locator(`[data-ban="${banned}"]`)).toBeVisible();
    await expect(page.getByTestId("my-role-adc")).toHaveAttribute("aria-pressed", "true"); // local player's position
    expect(stat.champions[top]).toBeTruthy();

    // A log without champion select says so and leaves the board alone.
    await page.getByTestId("log-file-input").setInputFiles({ name: "LeagueClient.log", mimeType: "text/plain", buffer: Buffer.from("000001.000|   OKAY| rcp-be-lol-login| nothing here\n") });
    await expect(page.getByTestId("sync-none")).toBeVisible();
    await expect(slot(page, "ally", "top")).toHaveAttribute("data-champion", String(top));
  });

  test("live sync keeps following a connected log folder", async ({ page, request }) => {
    const draft = await loadDraft(request);
    const top = topOfRole(draft, 0, 1)[0];
    const [jungle, enemyJungle] = topOfRole(draft, 1, 2);
    const line = (session: object) => `000557.706|   OKAY|    rcp-be-lol-champ-select| /lol-champ-select/v1/session: ${JSON.stringify(session)}\n`;
    const base = {
      localPlayerCellId: 1,
      myTeam: [
        { cellId: 0, championId: top, assignedPosition: "top" },
        { cellId: 1, championId: 0, assignedPosition: "jungle" },
      ],
      theirTeam: [{ cellId: 5, championId: 0 }],
      actions: [],
      bans: { myTeamBans: [], theirTeamBans: [] },
    };

    // Stand-in for the folder dialog: a directory with an old log, an unrelated file and the live client log.
    await page.addInitScript(() => {
      const w = window as unknown as { __log: string; showDirectoryPicker: unknown };
      w.__log = "000001.000|   OKAY| rcp-be-lol-login| started\n";
      w.showDirectoryPicker = async () => ({
        async *values() {
          yield { kind: "file", name: "2026-11-01_LeagueClient.log", getFile: async () => new File(["old"], "a.log", { lastModified: Date.now() - 86_400_000 }) };
          yield { kind: "file", name: "2026-11-12_LeagueClientUx.log", getFile: async () => new File(["ux"], "b.log", { lastModified: Date.now() }) };
          yield { kind: "directory", name: "sub" };
          yield { kind: "file", name: "2026-11-12_LeagueClient.log", getFile: async () => new File([w.__log], "c.log", { lastModified: Date.now() }) };
        },
      });
    });

    await page.goto("draft/");
    await page.getByTestId("live-sync").getByRole("button").first().click();
    await page.getByRole("button", { name: "League log klasörünü bağla" }).click();
    await expect(page.getByTestId("live-sync-panel")).toContainText("şampiyon seçimi bekleniyor");

    // Champion select starts: the client writes the first session.
    await page.evaluate((text) => ((window as unknown as { __log: string }).__log += text), line(base));
    await expect(slot(page, "ally", "top")).toHaveAttribute("data-champion", String(top), { timeout: 8000 });
    await expect(page.getByTestId("sync-live")).toBeVisible();
    await expect(page.getByTestId("my-role-jungle")).toHaveAttribute("aria-pressed", "true");

    // The enemy picks and the user hovers a champion: the board follows.
    const next = { ...base, myTeam: [base.myTeam[0], { cellId: 1, championId: 0, championPickIntent: jungle, assignedPosition: "jungle" }], theirTeam: [{ cellId: 5, championId: enemyJungle }] };
    await page.evaluate((text) => ((window as unknown as { __log: string }).__log += text), line(next));
    await expect(slot(page, "enemy", "jungle")).toHaveAttribute("data-champion", String(enemyJungle), { timeout: 8000 });
    await expect(slot(page, "ally", "jungle")).toHaveAttribute("data-champion", String(jungle));

    // A manual change is not overwritten while the log stays the same.
    await slot(page, "enemy", "jungle").getByRole("button", { name: /Temizle/ }).click();
    await page.waitForTimeout(4500);
    await expect(slot(page, "enemy", "jungle")).toHaveAttribute("data-champion", "");

    // After stopping, new log lines are ignored.
    await page.getByRole("button", { name: "Durdur" }).click();
    await page.evaluate((text) => ((window as unknown as { __log: string }).__log += text), line({ ...next, theirTeam: [{ cellId: 5, championId: enemyJungle }, { cellId: 6, championId: top === 1 ? 2 : 1 }] }));
    await page.waitForTimeout(3000);
    await expect(slot(page, "enemy", "jungle")).toHaveAttribute("data-champion", "");
  });

  test("the build follows the lane opponent", async ({ page, request }) => {
    const [draft, stat] = await Promise.all([loadDraft(request), loadStatic(request)]);
    const [mine, theirs] = topOfRole(draft, 3, 2);
    const file = await request.get(`data/champions/${stat.champions[mine].key}.json`).then((r) => r.json());
    const inRole = file.matches.filter((m: { role: string }) => m.role === "adc");
    const vs = inRole.filter((m: { opp: number }) => m.opp === theirs).length;
    await page.goto(`draft/?a=...${mine}.&e=...${theirs}.&r=3`);
    const used = inRole.length >= 12 ? inRole.length : file.matches.length;
    await expect(page.getByTestId("build-basis")).toContainText(`${used} pro maçından; ${inRole.length >= 12 ? vs : file.matches.filter((m: { opp: number }) => m.opp === theirs).length} tanesi`);
    await expect(page.getByTestId("build-panel").getByTestId("rune-page")).toBeVisible();
    await expect(page.getByTestId("build-order").locator("img").first()).toBeVisible();
    await expect(page.getByTestId("build-panel").getByTestId("skill-grid")).toBeVisible();
    await expect(page.getByTestId("build-panel").getByTestId("match-row").first()).toBeVisible();
  });
});
