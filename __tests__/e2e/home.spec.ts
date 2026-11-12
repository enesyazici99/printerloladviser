import { expect, test } from "@playwright/test";
import { loadMeta, loadStatic, watchErrors } from "./support";

test.describe("home", () => {
  test("shows every champion, the patch and the data sections", async ({ page, request }) => {
    const errors = watchErrors(page);
    const [stat, meta] = await Promise.all([loadStatic(request), loadMeta(request)]);
    await page.goto("");
    await expect(page.getByTestId("champion-grid").locator("a")).toHaveCount(Object.keys(stat.champions).length);
    await expect(page.getByTestId("patch-badge")).toContainText(meta.patches[0]);
    await expect(page.getByTestId("top-picks").locator("> div > div")).toHaveCount(5);
    await expect(page.getByTestId("latest-feed").getByTestId("match-row").first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("search narrows the grid and reports when nothing matches", async ({ page }) => {
    await page.goto("");
    const grid = page.getByTestId("champion-grid");
    await page.getByTestId("champion-search").fill("cait");
    await expect(grid.locator("a")).toHaveCount(1);
    await expect(grid.locator('a[data-champion="Caitlyn"]')).toBeVisible();
    await page.getByTestId("champion-search").fill("KAI SA");
    await expect(grid.locator('a[data-champion="Kaisa"]')).toBeVisible();
    await page.getByTestId("champion-search").fill("zzzz");
    await expect(grid.locator("a")).toHaveCount(0);
    await expect(grid).toContainText("Şampiyon bulunamadı");
  });

  test("role filter keeps only champions played in that role", async ({ page, request }) => {
    const meta = await loadMeta(request);
    // Expected set, computed like the page does: at least 15% of a champion's games in the role.
    const expected = Object.entries(meta.champions).filter(([, c]) => {
      const total = Object.values(c.roles).reduce((s, v) => s + (v?.[0] ?? 0), 0);
      return total > 0 && (c.roles.support?.[0] ?? 0) / total >= 0.15;
    }).length;
    await page.goto("");
    const links = page.getByTestId("champion-grid").locator("a");
    await page.locator('button[data-role="support"]').click();
    await expect(links).toHaveCount(expected);
    expect(expected).toBeGreaterThan(5);
    await page.locator('button[data-role="support"]').click(); // toggles off
    await expect(links).toHaveCount(Object.keys(meta.champions).length);
  });

  test("a champion tile opens its pro build page", async ({ page }) => {
    await page.goto("");
    await page.getByTestId("champion-search").fill("ahri");
    await page.locator('a[data-champion="Ahri"]').click();
    await expect(page).toHaveURL(/\/champion\/Ahri\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Ahri");
  });

  test("a feed row expands and links to the champion", async ({ page }) => {
    await page.goto("");
    const row = page.getByTestId("latest-feed").getByTestId("match-row").first();
    await row.locator("button[aria-expanded]").click();
    const detail = row.getByTestId("match-detail");
    await expect(detail.getByTestId("rune-page")).toBeVisible();
    await detail.getByRole("link").click();
    await expect(page).toHaveURL(/\/champion\/[A-Za-z]+\/$/);
  });

  test("language switch translates the page and is remembered", async ({ page }) => {
    await page.goto("");
    await expect(page.getByRole("navigation")).toContainText("Pro Buildler");
    await page.getByRole("button", { name: "en", exact: true }).click();
    await expect(page.getByRole("navigation")).toContainText("Pro Builds");
    await expect(page.getByTestId("champion-search")).toHaveAttribute("placeholder", "Search champion…");
    await page.reload();
    await expect(page.getByRole("navigation")).toContainText("Pro Builds");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("navigation reaches draft and meta", async ({ page }) => {
    await page.goto("");
    await page.getByRole("navigation").getByRole("link", { name: "Draft Asistanı" }).click();
    await expect(page).toHaveURL(/\/draft\/(\?.*)?$/); // the draft page keeps its state in the query
    await expect(page.getByTestId("draft-board")).toBeVisible();
    await page.getByRole("navigation").getByRole("link", { name: "Meta" }).click();
    await expect(page).toHaveURL(/\/meta\/$/);
    await expect(page.getByTestId("meta-table")).toBeVisible();
  });

  test("header search jumps straight to a champion from any page", async ({ page }) => {
    await page.goto("meta/");
    const search = page.getByTestId("header-search");
    const input = search.getByRole("combobox");
    await input.fill("ahr");
    await expect(search.getByRole("option")).toHaveCount(1);
    await expect(search.getByRole("option").first()).toContainText("Ahri");
    await input.press("Enter");
    await expect(page).toHaveURL(/\/champion\/Ahri\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Ahri");
    await expect(input).toHaveValue("");

    // Names starting with the query rank first, arrow keys move, a click opens the champion.
    await input.fill("vi");
    await expect(search.getByRole("option").first()).toContainText("Vi");
    await input.press("ArrowDown");
    await expect(search.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
    await search.locator('button[data-champion="Viktor"]').click();
    await expect(page).toHaveURL(/\/champion\/Viktor\/$/);

    // No match, Escape, and the "/" shortcut.
    await input.fill("zzzz");
    await expect(search.getByRole("listbox")).toContainText("Şampiyon bulunamadı");
    await input.press("Escape");
    await expect(search.getByRole("listbox")).toHaveCount(0);
    await page.locator("h1").click();
    await page.keyboard.press("/");
    await expect(input).toBeFocused();
  });

  test("header search opens from a button on phones @mobile", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone layout only");
    await page.goto("draft/");
    const search = page.locator('[data-testid="header-search"]:visible');
    await expect(search).toHaveCount(0);
    await page.getByTestId("mobile-search-toggle").click();
    await expect(search.getByRole("combobox")).toBeFocused();
    await search.getByRole("combobox").fill("jinx");
    await search.locator('button[data-champion="Jinx"]').click();
    await expect(page).toHaveURL(/\/champion\/Jinx\/$/);
    await expect(search).toHaveCount(0); // closes after picking
  });

  test("unknown pages show a 404", async ({ page }) => {
    const res = await page.goto("champion/NotAChampion/");
    expect(res?.status()).toBe(404);
  });

  test("fits a phone screen without sideways scrolling @mobile", async ({ page }) => {
    for (const path of ["", "draft/", "meta/", "champion/Ahri/"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow on "${path}"`).toBeLessThanOrEqual(1);
    }
  });
});
