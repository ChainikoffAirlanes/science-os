import { describe, expect, it } from "vitest";
import {
  statistics,
  compatibleUnits,
  chartData,
} from "../../src/lib/statistics";
import {
  canEdit,
  parseValue,
  projectSchema,
  registrationSchema,
  validateFile,
} from "../../src/lib/validation";
import {
  csvText,
  mapImport,
  parseCSV,
  readWorkbook,
} from "../../src/lib/data-files";
import type { Dataset, Parameter } from "../../src/types";
const p = {
  id: "p",
  name: "Температура",
  unit: "°C",
  value_type: "number",
  required: true,
} as Parameter;
describe("Scientific values and forms", () => {
  it("accepts decimal commas, zero, negatives and rejects invalid or missing values", () => {
    expect(parseValue("0", p)).toBe(0);
    expect(parseValue("-2,5", p)).toBe(-2.5);
    for (const v of ["", "NaN", "Infinity", "12abc"])
      expect(() => parseValue(v, p)).toThrow();
    expect(
      parseValue("", { value_type: "number", required: false }),
    ).toBeNull();
  });
  it("validates boolean and datetime values", () => {
    expect(parseValue("да", { value_type: "boolean", required: true })).toBe(
      true,
    );
    expect(parseValue("false", { value_type: "boolean", required: true })).toBe(
      false,
    );
    expect(() =>
      parseValue("maybe", { value_type: "boolean", required: true }),
    ).toThrow();
    expect(() =>
      parseValue("yesterday-ish", { value_type: "datetime", required: true }),
    ).toThrow();
    expect(
      parseValue("2026-01-01T10:00:00Z", {
        value_type: "datetime",
        required: true,
      }),
    ).toBe("2026-01-01T10:00:00.000Z");
  });
  it("rejects weak or mismatched registration passwords", () => {
    expect(
      registrationSchema.safeParse({
        first_name: "Никита",
        last_name: "Иванов",
        email: "a@example.com",
        password: "short",
        confirm: "short",
      }).success,
    ).toBe(false);
    expect(
      registrationSchema.safeParse({
        first_name: "Никита",
        last_name: "Иванов",
        email: "a@example.com",
        password: "long-password-123",
        confirm: "long-password-123",
      }).success,
    ).toBe(true);
  });
  it("rejects end dates before start dates", () => {
    expect(
      projectSchema.safeParse({
        title: "Test",
        description: "",
        hypothesis: "",
        objectives: "",
        methodology: "",
        expected_results: "",
        conclusions: "",
        science_category: "Физика",
        status: "active",
        start_date: "2026-02-02",
        due_date: "2026-01-01",
      }).success,
    ).toBe(false);
  });
  it("only editors and owners have client edit capabilities", () => {
    expect(canEdit("owner")).toBe(true);
    expect(canEdit("editor")).toBe(true);
    expect(canEdit("viewer")).toBe(false);
    expect(canEdit(null)).toBe(false);
    expect(canEdit("administrator")).toBe(false);
  });
  it("rejects executable, empty, oversized and spoofed uploads", () => {
    expect(
      validateFile({ name: "test.pdf", type: "application/pdf", size: 512 }),
    ).toBe("application/pdf");
    for (const f of [
      { name: "test.exe", type: "application/octet-stream", size: 1 },
      { name: "test.pdf", type: "application/pdf", size: 0 },
      { name: "test.pdf", type: "application/pdf", size: 11 * 1024 * 1024 },
      { name: "test.pdf", type: "image/png", size: 10 },
    ])
      expect(() => validateFile(f)).toThrow();
  });
});
describe("Statistics and chart conversion", () => {
  it("avoids overflow when calculating finite means and medians", () => {
    const s = statistics([1e308, 1e308]);
    expect(s.mean).toBe(1e308);
    expect(s.median).toBe(1e308);
    expect(s.std).toBe(0);
    expect(statistics([-1e308, 0, 1e308]).mean).toBe(0);
  });
  it("uses sample standard deviation and ignores missing/nonfinite data", () => {
    const s = statistics([1, 2, 3, 4, 5, null, "6", NaN, Infinity]);
    expect(s).toEqual({
      count: 5,
      min: 1,
      max: 5,
      mean: 3,
      median: 3,
      std: Math.sqrt(2.5),
    });
  });
  it("handles empty, singleton and even datasets", () => {
    expect(statistics([]).mean).toBeNull();
    expect(statistics([7]).std).toBeNull();
    expect(statistics([4, 1, 2, 3]).median).toBe(2.5);
  });
  it("does not combine incompatible units", () => {
    expect(compatibleUnits(["°C", "°C"])).toBe(true);
    expect(compatibleUnits(["°C", "K"])).toBe(false);
  });
  it("preserves zero and missing Y without joining unrelated rows", () => {
    const d = {
      rows: [{ id: "r1" }, { id: "r2" }],
      cells: [
        { experiment_row_id: "r1", experiment_parameter_id: "x", value: 0 },
        { experiment_row_id: "r2", experiment_parameter_id: "x", value: 1 },
        { experiment_row_id: "r1", experiment_parameter_id: "y", value: 4 },
      ],
    } as Dataset;
    expect(chartData(d, "x", ["y"])).toEqual([
      { x: 0, y: 4 },
      { x: 1, y: null },
    ]);
  });
});
describe("Data interchange", () => {
  it("parses CSV quoting, Cyrillic and delimiters", () => {
    expect(parseCSV('Время;Описание\n0;"Тест; один"\n1;"Два"')).toEqual([
      ["Время", "Описание"],
      ["0", "Тест; один"],
      ["1", "Два"],
    ]);
  });
  it("maps and validates imports, including missing required columns", () => {
    expect(mapImport([["2,5"]], [p], [0])).toEqual([[2.5]]);
    expect(() => mapImport([["wrong"]], [p], [0])).toThrow("Строка 2");
    expect(() => mapImport([["2"]], [p], [-1])).toThrow();
  });
  it("neutralizes spreadsheet formulas in CSV exports", () => {
    const text = csvText(
      ["Title"],
      [['=HYPERLINK("https://bad")'], ["@SUM(1)"], [0], [-2]],
    );
    expect(text).toContain("'=HYPERLINK");
    expect(text).toContain("'@SUM");
    expect(text).toContain("-2");
  });
  it("reads a real XLSX workbook with Cyrillic", async () => {
    const { Workbook } = await import("exceljs");
    const w = new Workbook(),
      sheet = w.addWorksheet("Данные");
    sheet.addRow(["Температура"]);
    sheet.addRow([21.5]);
    const buffer = await w.xlsx.writeBuffer();
    expect(await readWorkbook(buffer as ArrayBuffer)).toEqual([
      ["Температура"],
      ["21.5"],
    ]);
  });
});
