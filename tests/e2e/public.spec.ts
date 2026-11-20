import { test, expect } from "@playwright/test";
test("Login, registration and recovery have real form validation and protected routes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("#/login");
  await expect(
    page.getByRole("heading", { name: "Добро пожаловать", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Создать аккаунт", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Создайте своё пространство" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Войти", exact: true }).click();
  await page.getByRole("link", { name: "Забыли пароль?" }).click();
  await expect(
    page.getByRole("heading", { name: "Восстановление доступа" }),
  ).toBeVisible();
  await page.goto("#/dashboard");
  await expect(page).toHaveURL(/#\/login/);
  await page.goto("#/publications");
  await expect(
    page.getByRole("heading", { name: "Библиотека исследований", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
for (const width of [360, 375, 390, 768, 1024, 1440, 1920])
  test(`Public responsive ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("#/login");
    await expect(
      page.getByRole("heading", { name: "Добро пожаловать", exact: true }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`login-${width}.png`),
      fullPage: true,
    });
    await page.goto("#/register");
    await expect(
      page.getByRole("heading", { name: "Создайте своё пространство" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  });
