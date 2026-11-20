import Papa from "papaparse";
import type { Parameter, Value, Dataset } from "../types";
import { parseValue } from "./validation";
export function parseCSV(text: string): string[][] {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  if (result.errors.length)
    throw new Error("Некорректный CSV: " + result.errors[0].message);
  return result.data;
}
export async function readWorkbook(buffer: ArrayBuffer) {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  const sheet = book.worksheets[0];
  if (!sheet) throw new Error("В книге нет листов");
  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const values: string[] = [];
    for (let i = 1; i <= sheet.columnCount; i++) {
      const c = row.getCell(i);
      values.push(c.type === 6 ? String(c.result ?? "") : c.text);
    }
    rows.push(values);
  });
  return rows;
}
export function mapImport(
  rows: string[][],
  parameters: Parameter[],
  mapping: number[],
): Value[][] {
  return rows.map((row, index) =>
    parameters.map((p, i) => {
      try {
        return parseValue(mapping[i] < 0 ? "" : (row[mapping[i]] ?? ""), p);
      } catch (e) {
        throw new Error(
          `Строка ${index + 2}, ${p.name}: ${(e as Error).message}`,
          { cause: e },
        );
      }
    }),
  );
}
export function safeSpreadsheetValue(v: Value): Value {
  return typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}
export function datasetMatrix(d: Dataset): Value[][] {
  const map = new Map(
    d.cells.map((c) => [
      `${c.experiment_row_id}:${c.experiment_parameter_id}`,
      c.value,
    ]),
  );
  return d.rows.map((r) =>
    d.parameters.map((p) => map.get(`${r.id}:${p.id}`) ?? null),
  );
}
export function csvText(headers: string[], rows: Value[][]) {
  return (
    "\ufeff" +
    Papa.unparse([headers, ...rows.map((r) => r.map(safeSpreadsheetValue))])
  );
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportData(
  d: Dataset,
  format: "csv" | "xlsx",
  selectedRows?: Value[][],
) {
  const headers = d.parameters.map(
      (p) => p.name + (p.unit ? ` (${p.unit})` : ""),
    ),
    rows = selectedRows ?? datasetMatrix(d),
    name = d.experiment.title.replace(/[<>:"/\\|?*]/g, "_");
  if (format === "csv")
    download(
      new Blob([csvText(headers, rows)], { type: "text/csv;charset=utf-8" }),
      name + ".csv",
    );
  else {
    const { default: ExcelJS } = await import("exceljs");
    const book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet("Эксперимент");
    sheet.addRow(headers);
    for (const r of rows) sheet.addRow(r.map(safeSpreadsheetValue));
    sheet.columns.forEach((c) => (c.width = 24));
    download(
      new Blob([await book.xlsx.writeBuffer()], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      name + ".xlsx",
    );
  }
}
