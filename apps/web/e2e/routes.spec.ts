import { expect, test } from "@playwright/test";

/**
 * Moving between the lesson and the studio, on every pack. Nothing here names
 * a language: the pack is whatever the app was served.
 */
const index = { packs: [] as { id: string }[] };

test.beforeAll(async ({ request }) => {
  const response = await request.get("/packs/index.json");
  Object.assign(index, await response.json());
  expect(index.packs.length).toBeGreaterThanOrEqual(2);
});

test("the lesson and the studio are separate addresses that keep the pack choice", async ({
  page,
}) => {
  const scripts: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(request.url());
  });
  const studioLoaded = () => scripts.some((url) => /\/Studio-[^/]*\.js$/.test(url));

  for (const { id } of index.packs) {
    scripts.length = 0;
    const pack = (await (await page.request.get(`/packs/${id}/pack.json`)).json()) as {
      language: { autonym: string };
    };
    const title = page.getByRole("heading", { level: 1 });
    const nav = page.getByRole("navigation");

    // The lesson is at "/" and learners do not download the studio.
    await page.goto(`/?pack=${id}`);
    await expect(title).toHaveText(pack.language.autonym);
    await expect(page.getByTestId("listen")).toBeVisible();
    await expect(page.getByTestId("studio")).toHaveCount(0);
    expect(studioLoaded()).toBe(false);

    // Moving to the studio keeps the pack and loads the studio's code now.
    await nav.getByRole("link").nth(1).click();
    await expect(page).toHaveURL(`/studio?pack=${id}`);
    await expect(page.getByTestId("studio")).toBeVisible();
    await expect(page.getByTestId("listen")).toHaveCount(0);
    await expect(title).toHaveText(pack.language.autonym);
    expect(studioLoaded()).toBe(true);

    // ...and back again, without reloading the page.
    await nav.getByRole("link").nth(0).click();
    await expect(page).toHaveURL(`/?pack=${id}`);
    await expect(page.getByTestId("listen")).toBeVisible();

    // The browser's own back and forward buttons work too.
    await page.goBack();
    await expect(page.getByTestId("studio")).toBeVisible();
    await page.goForward();
    await expect(page.getByTestId("listen")).toBeVisible();

    // Reloading on the studio route serves the app, not a missing page.
    await page.goto(`/studio?pack=${id}`);
    await expect(page.getByTestId("studio")).toBeVisible();
    await expect(title).toHaveText(pack.language.autonym);
    await page.reload();
    await expect(page.getByTestId("studio")).toBeVisible();
  }
});

test("an unknown address shows the app with a way back to the lesson", async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("main").getByRole("link").click();
  await expect(page).toHaveURL("/");
  await expect(page.getByTestId("listen")).toBeVisible();
});
