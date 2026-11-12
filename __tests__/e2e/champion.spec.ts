import { expect, test } from "@playwright/test";
import { busiestChampion, loadStatic, pctText, watchErrors } from "./support";

test.describe("champion pro builds", () => {
  test("header and summary match the data", async ({ page, request }) => {
    const errors = watchErrors(page);
    const { champ, file } = await busiestChampion(request);
    await page.goto(`champion/${champ.key}/`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(champ.name);
    const wins = file.matches.filter((m) => m.w).length;
    await expect(page.getByTestId("summary-winrate")).toContainText(pctText(wins / file.matches.length));
    await expect(page.getByTestId("summary-winrate")).toContainText(`${file.matches.length} maç`);
    for (const id of ["summary-roles", "summary-runes", "summary-boots", "summary-items", "summary-spells", "summary-skills"]) {
      await expect(page.getByTestId(id).locator("img, svg").first()).toBeVisible();
    }
    await expect(page.getByTestId("build-paths")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("feed pages through all matches", async ({ page, request }) => {
    const { champ, file } = await busiestChampion(request);
    await page.goto(`champion/${champ.key}/`);
    const rows = page.getByTestId("match-list").getByTestId("match-row");
    await expect(rows).toHaveCount(Math.min(20, file.matches.length));
    if (file.matches.length > 20) {
      await page.getByTestId("show-more").click();
      await expect(rows).toHaveCount(Math.min(40, file.matches.length));
    }
  });

  test("filters change the feed and the summary together", async ({ page, request }) => {
    const { champ, file } = await busiestChampion(request);
    await page.goto(`champion/${champ.key}/`);
    const summary = page.getByTestId("summary-winrate");
    const rows = page.getByTestId("match-row");

    // Role
    const role = file.matches.find((m) => m.role)!.role!;
    const inRole = file.matches.filter((m) => m.role === role);
    await page.getByTestId("filters").locator(`button[data-role="${role}"]`).click();
    await expect(summary).toContainText(`${inRole.length} maç`);
    await expect(summary).toContainText(pctText(inRole.filter((m) => m.w).length / inRole.length));

    // Wins only: every visible row is a win
    await page.getByLabel("Sadece zaferler").check();
    const wins = inRole.filter((m) => m.w);
    await expect(summary).toContainText(`${wins.length} maç`);
    await expect(summary).toContainText("100%");
    expect(await rows.evaluateAll((els) => els.every((e) => (e as HTMLElement).dataset.win === "1"))).toBe(true);

    // Reset brings everything back
    await page.getByTestId("reset-filters").click();
    await expect(summary).toContainText(`${file.matches.length} maç`);
    await expect(page.getByTestId("reset-filters")).toHaveCount(0);
  });

  test("player and server filters use the right subsets", async ({ page, request }) => {
    const { champ, file } = await busiestChampion(request);
    await page.goto(`champion/${champ.key}/`);
    const summary = page.getByTestId("summary-winrate");

    const challengers = file.matches.filter((m) => m.p.tier === "C").length;
    await page.locator('button[data-players="challenger"]').click();
    await expect(summary).toContainText(`${challengers} maç`);

    const otps = file.matches.filter((m) => m.p.otp === 1).length;
    await page.locator('button[data-players="otp"]').click();
    if (otps === 0) await expect(page.getByTestId("no-matches")).toBeVisible();
    else await expect(summary).toContainText(`${otps} maç`);
    await page.locator('button[data-players="all"]').click();

    const server = file.matches[0].reg;
    const onServer = file.matches.filter((m) => m.reg === server).length;
    await page.getByLabel("Sunucu").selectOption(server);
    await expect(summary).toContainText(`${onServer} maç`);
  });

  test("opponent filter shows only games against that champion", async ({ page, request }) => {
    const { champ, file, stat } = await busiestChampion(request);
    // most common lane opponent
    const counts = new Map<number, number>();
    for (const m of file.matches) if (m.opp) counts.set(m.opp, (counts.get(m.opp) ?? 0) + 1);
    const [oppId, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const opp = stat.champions[oppId];

    await page.goto(`champion/${champ.key}/`);
    await page.getByTestId("vs-filter").click();
    const picker = page.getByTestId("champion-picker");
    await picker.getByRole("textbox").fill(opp.name);
    await picker.locator(`button[data-champion="${opp.key}"]`).click();
    await expect(picker).toHaveCount(0);
    await expect(page.getByTestId("summary-winrate")).toContainText(`${n} maç`);
    await expect(page.getByTestId("vs-filter")).toContainText(opp.name);
    await expect(page.getByTestId("match-row")).toHaveCount(Math.min(20, n));
  });

  test("a row expands into runes, item history, skill order and the teams", async ({ page, request }) => {
    const { champ, file, stat } = await busiestChampion(request);
    await page.goto(`champion/${champ.key}/`);
    const m = file.matches[0];
    const row = page.getByTestId("match-row").first();
    await expect(row).toContainText(m.p.n);
    await expect(row).toContainText(`${m.k} / ${m.de} / ${m.a}`);
    await row.locator("button[aria-expanded]").click();
    const detail = row.getByTestId("match-detail");

    // Rune page: the chosen runes are highlighted (4 primary + 2 secondary)
    await expect(detail.getByTestId("rune-page").locator('[data-selected="1"]')).toHaveCount(6);

    // Completed items in purchase order
    const completed = detail.getByTestId("completed-items").locator("img");
    await expect(completed).toHaveCount(m.ci.length);
    if (m.ci.length) await expect(completed.first()).toHaveAttribute("alt", stat.items[m.ci[0]].name);

    // Item path: one group per minute with purchases, in chronological order
    const minutes = [...new Set(Array.from({ length: m.ip.length / 3 }, (_, i) => Math.floor(m.ip[i * 3 + 1] / 60)))];
    const labels = await detail.getByTestId("item-path").locator("span.tabular").allTextContents();
    expect(labels).toHaveLength(minutes.length);
    const numbers = labels.map((l) => (l === "Başlangıç" ? 0 : parseInt(l, 10)));
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(numbers).toEqual(minutes);

    // Skill order: one filled cell per level
    const filled = detail.getByTestId("skill-grid").locator("div.text-white, div.text-black");
    await expect(filled).toHaveCount(Math.min(18, m.so.length));

    // Match tab: stats and both teams
    await detail.getByRole("tab", { name: "Maç" }).click();
    await expect(detail).toContainText(m.g.toLocaleString("en-US"));
    if (m.tm && m.en) await expect(detail.getByTestId("teams").locator("img")).toHaveCount(10);

    // Collapses again
    await row.locator("button[aria-expanded]").click();
    await expect(row.getByTestId("match-detail")).toHaveCount(0);
  });

  test("lane matchups panel and the link into the draft assistant", async ({ page, request }) => {
    const { champ } = await busiestChampion(request);
    await page.goto(`champion/${champ.key}/`);
    await expect(page.getByTestId("lane-matchups")).toBeVisible();
    await page.getByRole("link", { name: "Draft asistanında aç" }).click();
    await expect(page).toHaveURL(/\/draft\/\?/);
    await expect(page.locator(`[data-testid^="slot-ally-"][data-champion="${champ.id}"]`)).toHaveCount(1);
    await expect(page.getByTestId("build-panel")).toHaveAttribute("data-champion", String(champ.id));
  });

  test("every champion has a page and a data file", async ({ request }) => {
    const stat = await loadStatic(request);
    const keys = Object.values(stat.champions).map((c) => c.key);
    expect(keys.length).toBeGreaterThan(160);
    const failures: string[] = [];
    for (let i = 0; i < keys.length; i += 12) {
      await Promise.all(
        keys.slice(i, i + 12).map(async (key) => {
          const [pageRes, dataRes] = await Promise.all([request.get(`champion/${key}/`), request.get(`data/champions/${key}.json`)]);
          if (!pageRes.ok() || !dataRes.ok()) failures.push(key);
        })
      );
    }
    expect(failures).toEqual([]);
  });

  test("a champion with few or no games still renders", async ({ page, request }) => {
    const errors = watchErrors(page);
    const { meta, stat } = await busiestChampion(request);
    const [id] = Object.entries(meta.champions).sort((a, b) => a[1].feed - b[1].feed)[0];
    await page.goto(`champion/${stat.champions[id].key}/`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(stat.champions[id].name);
    await expect(page.getByTestId("filters")).toBeVisible();
    expect(errors).toEqual([]);
  });
});
