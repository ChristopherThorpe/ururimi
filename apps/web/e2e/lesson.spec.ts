import { expect, test, type Page } from "@playwright/test";

interface PackFile {
  language: { autonym: string };
  items: { id: string; text: string; audio: { file: string }[] }[];
}

/**
 * Every pack is run through the same lesson. Nothing here names a language:
 * the test works out the right answers from the pack the app was served.
 */
const index = { packs: [] as { id: string }[] };

test.beforeAll(async ({ request }) => {
  const response = await request.get("/packs/index.json");
  Object.assign(index, await response.json());
  expect(index.packs.length).toBeGreaterThanOrEqual(2);
});

async function promptItem(page: Page, pack: PackFile) {
  const clip = await page.getByTestId("listen").getAttribute("data-clip");
  const item = pack.items.find((candidate) => candidate.audio.some((a) => a.file === clip));
  expect(item, `no item uses clip ${clip}`).toBeDefined();
  return item!;
}

test("a learner can complete the first lesson of every pack", async ({ page, request }) => {
  for (const { id } of index.packs) {
    const pack = (await (await request.get(`/packs/${id}/pack.json`)).json()) as PackFile;
    const audioRequests: string[] = [];
    page.on("response", (response) => {
      if (response.url().includes(`/packs/${id}/media/audio/`) && response.ok()) {
        audioRequests.push(response.url());
      }
    });

    await page.goto(`/?pack=${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(pack.language.autonym);

    // First exercise: tap Listen, pick a wrong picture, then the right one.
    const first = await promptItem(page, pack);
    await page.getByTestId("listen").click();
    await expect.poll(() => audioRequests.length).toBeGreaterThan(0);

    const wrong = page.locator(`.option:not([data-item-id="${first.id}"])`).first();
    await wrong.click();
    await expect(wrong).toBeDisabled();
    await expect(page.getByTestId("wrong-message")).toBeVisible();
    await expect(page.getByTestId("next")).toHaveCount(0);

    await page.locator(`.option[data-item-id="${first.id}"]`).click();
    await expect(page.getByTestId("answer-text")).toHaveText(first.text);
    await page.getByTestId("next").click();

    // Remaining exercises: answer correctly straight away.
    while ((await page.getByTestId("finished").count()) === 0) {
      const item = await promptItem(page, pack);
      await page.locator(`.option[data-item-id="${item.id}"]`).click();
      await expect(page.getByTestId("answer-text")).toHaveText(item.text);
      await page.getByTestId("next").click();
    }
    await expect(page.getByTestId("finished")).toBeVisible();
  }
});

test("instructions can be switched between English and French", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByText("Listen, then choose the matching picture.")).toBeVisible();
  await page.getByRole("button", { name: "Français" }).click();
  await expect(page.getByText("Écoutez, puis choisissez l’image correspondante.")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");

  await page.reload();
  await expect(page.getByText("Écoutez, puis choisissez l’image correspondante.")).toBeVisible();
});

test("the page never scrolls sideways on a phone", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("listen")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
