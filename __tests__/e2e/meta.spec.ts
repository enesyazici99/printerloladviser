import { expect, test } from "@playwright/test";
import { loadMeta, watchErrors } from "./support";

const numbers = (texts: string[]) => texts.map((t) => parseFloat(t.replace("%", "")));

test.describe("meta table", () => {
  test("lists the champions of a role with rates from the data", async ({ page, request }) => {
    const errors = watchErrors(page);
    const meta = await loadMeta(request);
    await page.goto("meta/");
    const rows = page.getByTestId("meta-row");
    const expected = Object.values(meta.champions).filter((c) => {
      const g = c.roles.mid?.[0] ?? 0;
      return g >= 8 && g / (2 * meta.matches) >= 0.002;
    }).length;
    await expect(rows).toHaveCount(expected);
    expect(expected).toBeGreaterThan(5);
    await expect(page.getByText(meta.matches.toLocaleString("en-US"))).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("sorting and role tabs work", async ({ page }) => {
    await page.goto("meta/");
    const firstChampion = () => page.getByTestId("meta-row").first().locator("a").innerText();
    const midFirst = await firstChampion();

    await page.locator('button[data-sort="pick"]').click();
    const picks = numbers(await page.getByTestId("meta-row").locator("td:nth-child(5)").allTextContents());
    expect(picks).toEqual([...picks].sort((a, b) => b - a));

    await page.locator('button[data-sort="games"]').click();
    const games = numbers(await page.getByTestId("meta-row").locator("td:nth-child(6)").allTextContents());
    expect(games).toEqual([...games].sort((a, b) => b - a));

    await page.locator('button[data-role="jungle"]').click();
    await expect(page.locator('button[data-role="jungle"]')).toHaveAttribute("aria-selected", "true");
    expect(await firstChampion()).not.toBe(midFirst);
  });

  test("a row links to the champion's builds", async ({ page }) => {
    await page.goto("meta/");
    const link = page.getByTestId("meta-row").first().locator("a");
    const name = await link.innerText();
    await link.click();
    await expect(page).toHaveURL(/\/champion\/[A-Za-z]+\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(name.trim());
  });
});
