// Genuine Supabase requests. Routes add latency only; no response is mocked.
// Reuses the existing disposable owner and creates no additional Auth identity.
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const owner = existsSync(".tools/test-accounts.json")
  ? (JSON.parse(readFileSync(".tools/test-accounts.json", "utf8"))[0] as {
      id: string;
      email: string;
      password: string;
    })
  : undefined;
let api: SupabaseClient;
const ids: string[] = [];
const title = `QA · Поиск альфа ${Date.now()}`;
test.describe("Read and save lifetimes", () => {
  test.skip(
    !owner ||
      !process.env.VITE_SUPABASE_URL ||
      !process.env.VITE_SUPABASE_ANON_KEY,
    "Requires the existing disposable QA owner",
  );
  test.beforeAll(async () => {
    api = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const signed = await api.auth.signInWithPassword({
      email: owner!.email,
      password: owner!.password,
    });
    if (signed.error) throw signed.error;
    const r = await api
      .from("projects")
      .insert([{ title }, { title: title.replace("альфа", "бета") }])
      .select("id");
    if (r.error) throw r.error;
    ids.push(...r.data.map((p) => p.id));
  });
  test.afterAll(async () => {
    if (api && ids.length) {
      const r = await api
        .from("projects")
        .delete()
        .eq("owner_id", owner!.id)
        .in("id", ids);
      if (r.error) throw r.error;
      await api.auth.signOut({ scope: "local" });
    }
  });
  test("Search settles, navigation aborts stale reads, and an in-flight save survives", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("#/login");
    await page
      .getByLabel("Электронная почта", { exact: true })
      .fill(owner!.email);
    await page.getByLabel("Пароль", { exact: true }).fill(owner!.password);
    await page.getByRole("button", { name: "Войти в пространство" }).click();
    await expect(page).toHaveURL(/#\/dashboard$/);
    await page.goto("#/projects");
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await page.getByLabel("Поиск по названию").fill("несуществующий поиск");
    await page.getByLabel("Поиск по названию").fill("альфа");
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: title.replace("альфа", "бета"),
        exact: true,
      }),
    ).toHaveCount(0);
    const isProject = (raw: string) => {
      const u = new URL(raw);
      return (
        u.pathname === "/rest/v1/projects" &&
        u.searchParams.get("id") === "eq." + ids[0]
      );
    };
    let sawRead!: () => void;
    const readStarted = new Promise<void>((resolve) => {
      sawRead = resolve;
    });
    await page.route("**/rest/v1/projects?**", async (route) => {
      if (isProject(route.request().url())) {
        sawRead();
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      await route.continue().catch(() => {});
    });
    const cancelled = page.waitForEvent("requestfailed", {
      predicate: (req) => isProject(req.url()),
    });
    await page.goto(`#/projects/${ids[0]}`);
    await readStarted;
    await page.getByRole("link", { name: "Настройки", exact: true }).click();
    expect((await cancelled).failure()?.errorText).toMatch(/ABORTED/i);
    await expect(
      page.getByRole("heading", { name: "Настройки", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".error-state")).toHaveCount(0);
    await page.unroute("**/rest/v1/projects?**");
    await page.goto(`#/projects/${ids[0]}`);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Редактировать: Описание", exact: true })
      .click();
    const text = "Сохранение завершилось после перехода на другую страницу.";
    await page
      .getByRole("textbox", { name: "Текст раздела", exact: true })
      .fill(text);
    let sawSave!: () => void;
    const saveStarted = new Promise<void>((resolve) => {
      sawSave = resolve;
    });
    await page.route("**/rest/v1/rpc/update_record", async (route) => {
      sawSave();
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.continue();
    });
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await saveStarted;
    await page.goto("#/settings");
    await expect
      .poll(async () => {
        const r = await api
          .from("projects")
          .select("description")
          .eq("id", ids[0])
          .single();
        if (r.error) throw r.error;
        return r.data.description;
      })
      .toBe(text);
    await page.unroute("**/rest/v1/rpc/update_record");
    await page.goto(`#/projects/${ids[0]}`);
    await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
