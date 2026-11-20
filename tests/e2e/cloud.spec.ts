// REAL Supabase tests. No API mocking. Credentials are generated locally, ignored by Git.
// CI skips these unless the owner explicitly supplies disposable QA identities.
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { jsPDF } from "jspdf";
interface Account {
  role: string;
  id: string;
  email: string;
  password: string;
}
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const accounts: Account[] = existsSync(".tools/test-accounts.json")
  ? JSON.parse(await readFile(".tools/test-accounts.json", "utf8"))
  : [];
const enabled =
  accounts.length === 3 &&
  !!process.env.VITE_SUPABASE_URL &&
  !!process.env.VITE_SUPABASE_ANON_KEY;
let owner: SupabaseClient,
  editor: SupabaseClient,
  viewer: SupabaseClient,
  pid = "",
  eid = "",
  publicationId = "",
  opportunityId = "";
const title = `QA · Теплообмен ${Date.now()}`,
  description = "Проверка скорости остывания воды в лабораторных условиях.",
  hypothesis = "PRIVATE QA HYPOTHESIS — must not appear in publication";
async function login(page: Page, role: string) {
  const a = accounts.find((a) => a.role === role)!;
  await page.goto("#/login");
  await page
    .getByRole("textbox", { name: "Электронная почта", exact: true })
    .fill(a.email);
  await page.getByLabel("Пароль", { exact: true }).fill(a.password);
  await page.getByRole("button", { name: "Войти в пространство" }).click();
  await expect(page).toHaveURL(/#\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: /Добро пожаловать/ }),
  ).toBeVisible();
}
async function query<T>(
  p: PromiseLike<{ data: T | null; error: unknown }>,
): Promise<NonNullable<T>> {
  const r = await p;
  if (r.error)
    throw new Error("Supabase QA operation failed: " + JSON.stringify(r.error));
  return r.data as NonNullable<T>;
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}
test.describe.serial("Live Supabase research lifecycle", () => {
  test.skip(
    !enabled,
    "Requires locally prepared, disposable real Supabase QA identities",
  );
  test.beforeAll(async () => {
    const clients = await Promise.all(
      accounts.map(async (a) => {
        const c = createClient(
          process.env.VITE_SUPABASE_URL!,
          process.env.VITE_SUPABASE_ANON_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const { error } = await c.auth.signInWithPassword({
          email: a.email,
          password: a.password,
        });
        if (error) throw error;
        return c;
      }),
    );
    [owner, editor, viewer] = clients;
    await mkdir(".tools/qa-output", { recursive: true });
    // Recover only disposable fixtures owned by this dedicated QA identity.
    const leftovers = await query<{ id: string }[]>(
      owner
        .from("projects")
        .select("id")
        .eq("owner_id", accounts[0].id)
        .like("title", "QA · %"),
    );
    for (const p of leftovers) {
      const files = await query<{ storage_path: string }[]>(
        owner
          .from("project_files")
          .select("storage_path")
          .eq("project_id", p.id),
      );
      if (files.length)
        await query(
          owner.storage
            .from("science-project-files")
            .remove(files.map((f) => f.storage_path)),
        );
      await query(owner.from("project_files").delete().eq("project_id", p.id));
      await query(owner.from("projects").delete().eq("id", p.id));
    }
    await query(
      owner
        .from("opportunities")
        .delete()
        .eq("teacher_id", accounts[0].id)
        .eq("title", "QA · Лаборатория теплопередачи"),
    );
  });
  test("Registration creates a real student account and signs in without email", async ({
    page,
  }) => {
    const email = `scienceos.qa.${Date.now()}@gmail.com`,
      password = crypto.randomUUID() + "Aa9!";
    await page.goto("#/register");
    await page.getByLabel("Имя", { exact: true }).fill("QA-Reg");
    await page.getByLabel("Фамилия", { exact: true }).fill("Disposable");
    await page.getByLabel("Электронная почта", { exact: true }).fill(email);
    await page.getByLabel("Пароль", { exact: true }).fill(password);
    await page.getByLabel("Повтор пароля", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Создать аккаунт", exact: true })
      .click();
    await expect(page).toHaveURL(/#\/dashboard$/);
    await expect(
      page.getByRole("heading", {
        name: "Добро пожаловать, QA-Reg",
        exact: true,
      }),
    ).toBeVisible();
    const client = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const result = await client.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    const id = result.data.user.id;
    const roles = await query<{ role: string }[]>(
      client.from("user_roles").select("role").eq("user_id", id),
    );
    expect(roles[0].role).toBe("student");
    const path = ".tools/qa-registration-users.json",
      ids: string[] = existsSync(path)
        ? JSON.parse(await readFile(path, "utf8"))
        : [];
    ids.push(id);
    await writeFile(path, JSON.stringify(ids));
    await client.auth.signOut({ scope: "local" });
  });
  test("A–C: real login, project creation, typed measurements and persistence", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await login(page, "owner");
    await page
      .getByRole("link", { name: "Создать проект", exact: true })
      .click();
    await page
      .getByLabel("Название исследования *", { exact: true })
      .fill(title);
    await page.getByLabel("Описание", { exact: true }).fill(description);
    await page.getByLabel("Гипотеза", { exact: true }).fill(hypothesis);
    await page
      .getByLabel("Цели исследования", { exact: true })
      .fill("Измерить изменение температуры воды во времени.");
    await page
      .getByLabel("Методология", { exact: true })
      .fill("Измерять температуру через равные интервалы.");
    await page
      .getByRole("button", { name: "Создать проект", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    pid = page.url().match(/projects\/([^/]+)/)![1];
    await page.reload();
    await expect(page.getByText(hypothesis, { exact: true })).toBeVisible();
    await page
      .getByRole("navigation", { name: "Разделы проекта" })
      .getByRole("link", { name: "Эксперименты", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Новый эксперимент", exact: true })
      .first()
      .click();
    let dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Название *", { exact: true })
      .fill("Остывание воды");
    await dialog
      .getByLabel("Описание", { exact: true })
      .fill("Измерения в закрытом помещении.");
    await dialog
      .getByRole("button", { name: "Создать эксперимент", exact: true })
      .click();
    await expect(page).toHaveURL(/experiments\/[^/]+$/);
    await expect(
      page.getByRole("heading", { name: "Остывание воды", exact: true }),
    ).toBeVisible();
    eid = page.url().split("/").at(-1)!;
    for (const [name, unit] of [
      ["Время", "с"],
      ["Температура", "°C"],
    ]) {
      await page.getByRole("button", { name: "Параметр", exact: true }).click();
      dialog = page.getByRole("dialog");
      await dialog.getByLabel("Название *", { exact: true }).fill(name);
      await dialog.getByLabel("Единица измерения").fill(unit);
      await dialog
        .getByRole("button", { name: "Сохранить", exact: true })
        .click();
      await expect(dialog).not.toBeVisible();
    }
    await page
      .getByRole("button", { name: "Добавить строку", exact: true })
      .click();
    await page.getByRole("textbox", { name: /Время, наблюдение/ }).fill("0");
    await page.getByRole("textbox", { name: /Время, наблюдение/ }).press("Tab");
    await page
      .getByRole("textbox", { name: /Температура, наблюдение/ })
      .fill("80,5");
    await page
      .getByRole("textbox", { name: /Температура, наблюдение/ })
      .press("Enter");
    await expect
      .poll(async () => {
        const rows = await query(
          owner
            .from("experiment_cells")
            .select("value")
            .eq("experiment_id", eid),
        );
        return rows.map((r) => r.value).sort((a, b) => a - b);
      })
      .toEqual([0, 80.5]);
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: /Температура, наблюдение/ }),
    ).toHaveValue("80.5");
    expect(errors).toEqual([]);
  });
  test("E–F: invitation, two-user realtime, conflict and viewer enforcement", async ({
    browser,
  }) => {
    const a = await browser.newContext(),
      b = await browser.newContext(),
      pa = await a.newPage(),
      pb = await b.newPage();
    await login(pa, "owner");
    await login(pb, "editor");
    const inv = await query(
      owner.rpc("create_invite", { pid, assigned_role: "editor", max_uses: 1 }),
    );
    await pb.goto(`#/invite/${inv.token}`);
    await pb.getByRole("button", { name: "Принять приглашение" }).click();
    await expect(
      pb.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await pa.goto(`#/projects/${pid}/experiments/${eid}`);
    await pb.goto(`#/projects/${pid}/experiments/${eid}`);
    const ca = pa.getByRole("textbox", { name: /Температура, наблюдение/ }),
      cb = pb.getByRole("textbox", { name: /Температура, наблюдение/ });
    await expect(cb).toHaveValue("80.5");
    await ca.fill("79");
    await ca.press("Enter");
    await expect(cb).toHaveValue("79", { timeout: 20000 });
    // Both users start from the same server version. A writes; B must not overwrite silently.
    await ca.fill("78");
    await cb.fill("77");
    await ca.press("Enter");
    await expect
      .poll(async () => {
        const r = await query(
          owner
            .from("experiment_cells")
            .select("value")
            .eq("experiment_id", eid)
            .eq("value", 78),
        );
        return r.length;
      })
      .toBe(1);
    await cb.press("Enter");
    await expect(
      pb.getByRole("heading", { name: "Конфликт изменений", exact: true }),
    ).toBeVisible();
    await pb.getByRole("button", { name: "Принять текущее" }).click();
    await expect(cb).toHaveValue("78");
    const deletionSignals: Record<string, unknown>[] = [];
    const deletionChannel = editor
      .channel(`project:${pid}`, { config: { private: true } })
      .on("broadcast", { event: "deleted" }, (event) =>
        deletionSignals.push(event.payload),
      );
    await new Promise<void>((resolve, reject) =>
      deletionChannel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          reject(new Error("Private QA channel did not authorize"));
      }),
    );
    const added = await query<{ id: string }>(
      owner
        .from("experiment_rows")
        .insert({ project_id: pid, experiment_id: eid })
        .select("id")
        .single(),
    );
    await expect(
      pb.getByRole("textbox", { name: /Время, наблюдение/ }),
    ).toHaveCount(2);
    await query(owner.from("experiment_rows").delete().eq("id", added.id));
    await expect(
      pb.getByRole("textbox", { name: /Время, наблюдение/ }),
    ).toHaveCount(1, { timeout: 20000 });
    await expect
      .poll(() => deletionSignals.some((e) => e.table === "experiment_rows"))
      .toBe(true);
    // Supabase adds its transport message UUID. Scientific row data must not be present.
    expect(
      Object.keys(
        deletionSignals.find((e) => e.table === "experiment_rows")!,
      ).every((key) => ["id", "table"].includes(key)),
    ).toBe(true);
    await editor.removeChannel(deletionChannel);
    editor.realtime.disconnect();
    const outsider = await query(
      viewer.from("projects").select("id").eq("id", pid),
    );
    expect(outsider).toHaveLength(0);
    const vi = await query(
      owner.rpc("create_invite", { pid, assigned_role: "viewer", max_uses: 1 }),
    );
    await query(viewer.rpc("accept_invite", { token: vi.token }));
    expect(
      await query(viewer.from("projects").select("id").eq("id", pid)),
    ).toHaveLength(1);
    const denial = await viewer
      .from("experiment_rows")
      .insert({ project_id: pid, experiment_id: eid });
    expect(denial.error).toBeTruthy();
    const c = await query(
      owner
        .from("experiment_cells")
        .select("*")
        .eq("experiment_id", eid)
        .limit(1),
    );
    const rpcDenied = await viewer.rpc("save_cell", {
      rid: c[0].experiment_row_id,
      paramid: c[0].experiment_parameter_id,
      new_value: 99,
      expected_version: c[0].version,
    });
    expect(rpcDenied.error).toBeTruthy();
    const roleDenied = await viewer
      .from("user_roles")
      .update({ role: "administrator" })
      .eq("user_id", accounts[2].id)
      .select();
    expect(roleDenied.data ?? []).toHaveLength(0);
    const member = await query<{ id: string }>(
      owner
        .from("project_members")
        .select("id")
        .eq("project_id", pid)
        .eq("user_id", accounts[2].id)
        .single(),
    );
    await query(owner.rpc("change_member", { mid: member.id, new_role: null }));
    await a.close();
    await b.close();
  });
  test("D: CSV import preview, all charts, saved chart, exports and statistics", async ({
    page,
  }) => {
    await login(page, "owner");
    await page.goto(`#/projects/${pid}/experiments/${eid}`);
    await page.getByRole("button", { name: "Импорт", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Файл для импорта").setInputFiles({
      name: "measurements.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Время,Температура\n10,75\n20,70\n30,66\n40,62\n50,59",
        "utf8",
      ),
    });
    await expect(
      dialog.getByRole("button", { name: "Добавить 5 строк" }),
    ).toBeEnabled();
    await dialog.getByRole("button", { name: "Добавить 5 строк" }).click();
    await expect(dialog).not.toBeVisible();
    expect(
      (
        await query(
          owner.from("experiment_rows").select("id").eq("experiment_id", eid),
        )
      ).length,
    ).toBe(6);
    const { default: ExcelJS } = await import("exceljs"),
      workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Наблюдения").addRows([
      ["Время", "Температура"],
      [60, 55],
    ]);
    await page.getByRole("button", { name: "Импорт", exact: true }).click();
    await page.getByLabel("Файл для импорта").setInputFiles({
      name: "extra.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    });
    await page
      .getByRole("button", { name: "Добавить 1 строк", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    expect(
      (
        await query(
          owner.from("experiment_rows").select("id").eq("experiment_id", eid),
        )
      ).length,
    ).toBe(7);
    await page.locator("summary").filter({ hasText: "Экспорт" }).click();
    const excelDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Скачать Excel", exact: true })
      .click();
    await (await excelDownload).saveAs(".tools/qa-output/measurements.xlsx");
    const exported = new ExcelJS.Workbook();
    await exported.xlsx.readFile(".tools/qa-output/measurements.xlsx");
    expect(exported.worksheets[0].rowCount).toBe(8);
    const control = await query<{ id: string }>(
      owner
        .from("experiments")
        .insert({
          project_id: pid,
          title: "Контрольный опыт",
          description: "Короткая серия для сопоставления.",
        })
        .select("id")
        .single(),
    );
    const params = await query<{ id: string }[]>(
      owner
        .from("experiment_parameters")
        .insert([
          {
            project_id: pid,
            experiment_id: control.id,
            name: "Время",
            value_type: "number",
            unit: "с",
            sort_order: 0,
          },
          {
            project_id: pid,
            experiment_id: control.id,
            name: "Температура",
            value_type: "number",
            unit: "°C",
            sort_order: 1,
          },
        ])
        .select("id,sort_order")
        .order("sort_order"),
    );
    await query(
      owner.rpc("import_observations", {
        eid: control.id,
        parameter_ids: params.map((p) => p.id),
        values_matrix: [
          [0, 78],
          [20, 71],
          [40, 63],
        ],
      }),
    );
    await page.goto(`#/projects/${pid}/analytics`);
    await expect(page.getByTestId("research-chart")).toBeVisible();
    await page
      .getByRole("checkbox", { name: "Остывание воды", exact: true })
      .check();
    await page
      .getByRole("checkbox", { name: "Контрольный опыт", exact: true })
      .check();
    for (const type of ["line", "bar", "area", "comparison"]) {
      await page.getByLabel("Тип графика", { exact: true }).selectOption(type);
      await page
        .getByRole("button", { name: "Построить", exact: true })
        .click();
      await expect(page.locator(".recharts-surface").first()).toBeVisible();
    }
    await expect(page.locator(".recharts-line-curve")).toHaveCount(2);
    for (const curve of await page.locator(".recharts-line-curve").all()) {
      await expect(curve).toHaveAttribute("d", /L/);
    }
    await page.getByRole("button", { name: "Сохранить конфигурацию" }).click();
    await expect(page.getByLabel("Сохранённые графики")).toBeVisible();
    await expect(
      page.getByText("Станд. отклонение", { exact: true }).first(),
    ).toBeVisible();
    await page
      .locator("summary")
      .filter({ hasText: "Экспортировать график" })
      .click();
    const pngPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "PNG", exact: true }).click();
    const png = await pngPromise;
    await png.saveAs(".tools/qa-output/chart.png");
    expect(
      (await readFile(".tools/qa-output/chart.png"))
        .subarray(0, 8)
        .toString("hex"),
    ).toBe("89504e470d0a1a0a");
    for (const format of ["SVG", "PDF"]) {
      const downloaded = page.waitForEvent("download");
      await page.getByRole("button", { name: format, exact: true }).click();
      await (
        await downloaded
      ).saveAs(`.tools/qa-output/chart.${format.toLowerCase()}`);
    }
    expect(await readFile(".tools/qa-output/chart.svg", "utf8")).toContain(
      "Время",
    );
  });
  test("G–H: private file roundtrip, tasks, report PDF and Cyrillic", async ({
    page,
  }) => {
    await login(page, "owner");
    await page.goto(`#/projects/${pid}/files`);
    const pdf = new jsPDF();
    pdf.text("Disposable Science OS storage QA", 20, 20);
    const pdfBytes = Buffer.from(pdf.output("arraybuffer"));
    const { default: ExcelJS } = await import("exceljs");
    const book = new ExcelJS.Workbook();
    book.addWorksheet("Данные").addRow(["Температура", 78]);
    const xlsx = Buffer.from(await book.xlsx.writeBuffer());
    for (const [name, mimeType, buffer] of [
      ["qa.pdf", "application/pdf", pdfBytes],
      [
        "qa.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        xlsx,
      ],
    ] as const) {
      await page
        .getByLabel("Загрузить файлы", { exact: true })
        .setInputFiles({ name, mimeType, buffer });
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeVisible();
      const record = await query(
        owner
          .from("project_files")
          .select("*")
          .eq("project_id", pid)
          .eq("original_name", name)
          .single<{ storage_path: string }>(),
      );
      const stored = await query(
        owner.storage
          .from("science-project-files")
          .download(record.storage_path),
      );
      expect(Buffer.from(await stored.arrayBuffer()).equals(buffer)).toBe(true);
      const anon = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.VITE_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
      );
      expect(
        (
          await anon.storage
            .from("science-project-files")
            .download(record.storage_path)
        ).error,
      ).toBeTruthy();
      expect(
        (
          await viewer.storage
            .from("science-project-files")
            .download(record.storage_path)
        ).error,
      ).toBeTruthy();
    }
    await page.getByRole("button", { name: "qa.pdf", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Удалить", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Подтвердить", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "qa.pdf", exact: true }),
    ).toHaveCount(0);
    const vi = await query(
      owner.rpc("create_invite", { pid, assigned_role: "viewer", max_uses: 1 }),
    );
    await query(viewer.rpc("accept_invite", { token: vi.token }));
    await page.goto(`#/projects/${pid}/tasks`);
    await page
      .getByRole("button", { name: "Создать задачу", exact: true })
      .click();
    let dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Название *", { exact: true })
      .fill("Проверить результаты измерений");
    await dialog
      .getByLabel("Исполнитель", { exact: true })
      .selectOption(accounts[1].id);
    await dialog
      .getByRole("button", { name: "Создать задачу", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await page
      .getByRole("button")
      .filter({
        has: page.getByRole("heading", {
          name: "Проверить результаты измерений",
          exact: true,
        }),
      })
      .click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Статус", { exact: true }).selectOption("done");
    await dialog
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    await expect(
      dialog.getByText("Готово", { exact: true }).first(),
    ).toBeVisible();
    await dialog
      .getByRole("textbox", { name: "Комментарий", exact: true })
      .fill("Измерения перепроверены.");
    await dialog
      .getByRole("button", { name: "Отправить", exact: true })
      .click();
    await expect(
      dialog.getByText("Измерения перепроверены.", { exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
    await page.goto(`#/projects/${pid}/report`);
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Скачать PDF", exact: true })
      .click();
    const report = await downloadPromise;
    await report.saveAs(".tools/qa-output/science-report.pdf");
    expect(
      (await readFile(".tools/qa-output/science-report.pdf"))
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");
  });
  test("Narrative blocks and task drafts reject stale concurrent edits", async ({
    browser,
  }) => {
    const ac = await browser.newContext(),
      bc = await browser.newContext(),
      a = await ac.newPage(),
      b = await bc.newPage();
    await login(a, "owner");
    await login(b, "editor");
    for (const p of [a, b]) {
      await p.goto(`#/projects/${pid}`);
      await p
        .getByRole("button", { name: "Редактировать: Описание", exact: true })
        .click();
    }
    const textA = "Совместное описание сохранено первым участником.",
      textB = "Собственная несохранённая версия второго участника.";
    await a
      .getByRole("textbox", { name: "Текст раздела", exact: true })
      .fill(textA);
    await b
      .getByRole("textbox", { name: "Текст раздела", exact: true })
      .fill(textB);
    await a.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(a.getByRole("dialog")).not.toBeVisible();
    await expect(
      b.getByRole("textbox", { name: "Текст раздела", exact: true }),
    ).toHaveValue(textB);
    await b.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(
      b.getByText("Конфликт изменений", { exact: true }),
    ).toBeVisible();
    await b
      .getByRole("button", { name: "Принять серверную версию", exact: true })
      .click();
    await expect(b.getByText(textA, { exact: true }).first()).toBeVisible();
    for (const p of [a, b]) {
      await p.goto(`#/projects/${pid}/tasks`);
      await p
        .getByRole("button")
        .filter({
          has: p.getByRole("heading", {
            name: "Проверить результаты измерений",
            exact: true,
          }),
        })
        .click();
    }
    await a
      .getByRole("dialog")
      .getByLabel("Описание", { exact: true })
      .fill(textA);
    await b
      .getByRole("dialog")
      .getByLabel("Описание", { exact: true })
      .fill(textB);
    await a
      .getByRole("dialog")
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    await expect
      .poll(async () => {
        const r = await query<{ description: string }[]>(
          owner.from("tasks").select("description").eq("project_id", pid),
        );
        return r[0].description;
      })
      .toBe(textA);
    await expect(
      b.getByRole("dialog").getByLabel("Описание", { exact: true }),
    ).toHaveValue(textB);
    await b
      .getByRole("dialog")
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    await expect(
      b.getByText("Запись изменена другим участником", { exact: true }),
    ).toBeVisible();
    await b
      .getByRole("button", { name: "Загрузить серверные поля", exact: true })
      .click();
    await expect(
      b.getByRole("dialog").getByLabel("Описание", { exact: true }),
    ).toHaveValue(textA);
    await ac.close();
    await bc.close();
  });
  test("I–J: selective public snapshot and teacher/student applications", async ({
    page,
    browser,
  }) => {
    await login(page, "owner");
    await page.goto(`#/projects/${pid}/report`);
    await page.getByRole("button", { name: "Опубликовать работу" }).click();
    let dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Видимость", { exact: true })
      .selectOption("public");
    await dialog.getByRole("checkbox").last().check();
    await dialog.getByRole("button", { name: "Опубликовать снимок" }).click();
    await expect(dialog).not.toBeVisible();
    const publication = await query(
      owner
        .from("publications")
        .select("id")
        .eq("project_id", pid)
        .single<{ id: string }>(),
    );
    publicationId = publication.id;
    const context = await browser.newContext(),
      publicPage = await context.newPage();
    await publicPage.goto(`#/publications/${publicationId}`);
    await expect(
      publicPage.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(publicPage.getByText(hypothesis, { exact: true })).toHaveCount(
      0,
    );
    await context.close();
    await page.goto("#/opportunities");
    await page
      .getByRole("button", { name: "Создать возможность", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Название *", { exact: true })
      .fill("QA · Лаборатория теплопередачи");
    await dialog
      .getByLabel("Описание *", { exact: true })
      .fill("Одноразовая проверка заявок преподавателю.");
    await dialog
      .getByLabel("Срок подачи заявки *", { exact: true })
      .fill("2099-01-01");
    await dialog
      .getByLabel("Количество мест (пусто — без ограничения)")
      .fill("1");
    await dialog
      .getByRole("button", { name: "Опубликовать возможность" })
      .click();
    await expect(dialog).not.toBeVisible();
    const opportunity = await query(
      owner
        .from("opportunities")
        .select("id")
        .eq("title", "QA · Лаборатория теплопередачи")
        .single<{ id: string }>(),
    );
    opportunityId = opportunity.id;
    const studentContext = await browser.newContext(),
      student = await studentContext.newPage();
    await login(student, "editor");
    await student.goto(`#/opportunities/${opportunityId}`);
    await student.getByRole("button", { name: "Подать заявку" }).click();
    dialog = student.getByRole("dialog");
    await dialog
      .getByLabel("Расскажите о вашем интересе к теме *", { exact: true })
      .fill("Хочу проверить зависимость охлаждения от времени.");
    await dialog.getByRole("button", { name: "Отправить заявку" }).click();
    await expect(dialog).not.toBeVisible();
    await page.goto(`#/opportunities/${opportunityId}`);
    await page.getByRole("button", { name: "Принять", exact: true }).click();
    await expect(page.getByText("Принят", { exact: true })).toBeVisible();
    expect(
      (await query(editor.from("notifications").select("id"))).length,
    ).toBeGreaterThan(0);
    await studentContext.close();
  });
  test("Unsaved edits, project copy, experiment metadata and deletion work end to end", async ({
    page,
  }) => {
    await login(page, "owner");
    await page.goto(`#/projects/${pid}/experiments/${eid}`);
    const cell = page
      .getByRole("textbox", { name: /Время, наблюдение/ })
      .first();
    await cell.fill("invalid");
    await cell.press("Tab");
    await expect(page.getByRole("alert")).toContainText(
      "Введите конечное число",
    );
    await page
      .getByRole("navigation", { name: "Разделы проекта" })
      .getByRole("link", { name: "Аналитика", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Есть несохранённые изменения",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Остаться в редакторе" }).click();
    await expect(cell).toHaveValue("invalid");
    await cell.press("Escape");
    await expect(cell).toHaveValue("0");
    await page.goto("#/projects");
    await page
      .getByRole("button", { name: `Действия: ${title}`, exact: true })
      .click();
    await page
      .getByRole("button", { name: "Дублировать данные", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: title + " (копия)", exact: true }),
    ).toBeVisible();
    const copy = page.url().match(/projects\/([^/?]+)/)![1];
    expect(copy).not.toBe(pid);
    expect(
      (
        await query(
          owner.from("experiments").select("id").eq("project_id", copy),
        )
      ).length,
    ).toBe(2);
    expect(
      (
        await query(
          owner.from("project_files").select("id").eq("project_id", copy),
        )
      ).length,
    ).toBe(0);
    await query(owner.from("projects").delete().eq("id", copy));
    const temporary = await query<{ id: string }>(
      owner
        .from("experiments")
        .insert({ project_id: pid, title: "QA temporary experiment" })
        .select("id")
        .single(),
    );
    await page.goto(`#/projects/${pid}/experiments`);
    const card = page.locator(".experiment-card").filter({
      has: page.getByRole("heading", {
        name: "QA temporary experiment",
        exact: true,
      }),
    });
    await card
      .getByRole("button", { name: "Редактировать", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Описание", { exact: true })
      .fill("Проверена форма редактирования.");
    await dialog
      .getByLabel("Ответственный", { exact: true })
      .selectOption(accounts[0].id);
    await dialog
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(
      card.getByText("Проверена форма редактирования.", { exact: true }),
    ).toBeVisible();
    await card.getByRole("button", { name: "Удалить", exact: true }).click();
    await page
      .getByRole("button", { name: "Подтвердить", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(card).toHaveCount(0);
    expect(
      (
        await query(
          owner.from("experiments").select("id").eq("id", temporary.id),
        )
      ).length,
    ).toBe(0);
  });
  test("Profile avatar, dark theme and sidebar collapse preserve real settings", async ({
    page,
  }, info) => {
    await login(page, "owner");
    await page.goto("#/profile");
    await page
      .getByLabel("Изменить аватар", { exact: true })
      .setInputFiles(".tools/qa-output/chart.png");
    await expect(page.locator(".profile-summary .avatar img")).toBeVisible();
    await page.goto("#/settings");
    await page.getByRole("button", { name: "Тёмная", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.goto("#/dashboard");
    await noOverflow(page);
    await page.screenshot({
      path: info.outputPath("dashboard-dark-1440.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Свернуть меню", exact: true })
      .click();
    await expect(page.locator(".app-shell")).toHaveClass(/collapsed/);
    await page
      .getByRole("button", { name: "Развернуть меню", exact: true })
      .click();
    await expect(page.locator(".app-shell")).not.toHaveClass(/collapsed/);
    await page
      .getByRole("button", { name: "Переключить тему", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
  for (const width of [360, 375, 390, 768, 1024, 1440, 1920])
    test(`Responsive research workspace ${width}px`, async ({ page }, info) => {
      await login(page, "owner");
      await page.setViewportSize({ width, height: 1000 });
      for (const [route, name] of [
        ["/dashboard", "dashboard"],
        ["/projects", "projects"],
        [`/projects/${pid}/experiments/${eid}`, "editor"],
        [`/projects/${pid}/analytics`, "analytics"],
        [`/projects/${pid}/files`, "files"],
        [`/projects/${pid}/team`, "team"],
        [`/projects/${pid}/tasks`, "tasks"],
        [`/projects/${pid}/report`, "report"],
      ]) {
        await page.goto("#" + route);
        await expect(page.locator(".loading")).toHaveCount(0);
        await expect(page.locator(".skeleton-grid")).toHaveCount(0);
        await page.evaluate(() => document.fonts.ready);
        await noOverflow(page);
        await page.screenshot({
          path: info.outputPath(`${name}-${width}.png`),
          fullPage: true,
        });
      }
      await page.goto(`#/projects/${pid}/experiments/${eid}`);
      await page.getByRole("button", { name: "Параметр", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await noOverflow(page);
      await page.screenshot({
        path: info.outputPath(`dialog-${width}.png`),
        fullPage: true,
      });
    });
  test.afterAll(async () => {
    if (!owner || !pid) return;
    // Remove only fixtures created by this test run; never enumerate/delete user projects.
    const files = await query(
      owner.from("project_files").select("storage_path").eq("project_id", pid),
    );
    if (files.length)
      await query(
        owner.storage
          .from("science-project-files")
          .remove(files.map((f) => f.storage_path)),
      );
    await query(owner.from("project_files").delete().eq("project_id", pid));
    if (publicationId)
      await query(owner.from("publications").delete().eq("id", publicationId));
    if (opportunityId)
      await query(owner.from("opportunities").delete().eq("id", opportunityId));
    await query(owner.from("projects").delete().eq("id", pid));
    await Promise.all([owner, editor, viewer].map((c) => c.auth.signOut()));
    await writeFile(
      ".tools/qa-output/cleanup.json",
      JSON.stringify({ project: pid, removed: true }),
    );
  });
});
