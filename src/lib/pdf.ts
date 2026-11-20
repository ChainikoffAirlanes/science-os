import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Dataset, Project } from "../types";
import { sectionLabels, date } from "./validation";
import { datasetMatrix } from "./data-files";
import { statistics } from "./statistics";
let fontPromise: Promise<string> | undefined;
async function font() {
  fontPromise ??= fetch(
    `${import.meta.env.BASE_URL}fonts/Roboto-Regular.ttf`,
  ).then(async (r) => {
    if (!r.ok) throw new Error("Не удалось загрузить шрифт отчёта");
    const bytes = new Uint8Array(await r.arrayBuffer());
    let str = "";
    for (let i = 0; i < bytes.length; i += 8192)
      str += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(str);
  });
  return fontPromise;
}
export async function createPDF() {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.addFileToVFS("Roboto.ttf", await font());
  doc.addFont("Roboto.ttf", "Roboto", "normal");
  doc.setFont("Roboto");
  doc.setTextColor(15, 23, 42);
  return doc;
}
export interface ReportOptions {
  sections: string[];
  tables: boolean;
  charts: boolean;
  statistics: boolean;
  authors: boolean;
}
export const defaultReportOptions: ReportOptions = {
  sections: Object.keys(sectionLabels),
  tables: true,
  charts: true,
  statistics: true,
  authors: true,
};
export async function reportPDF(
  project: Project,
  datasets: Dataset[],
  authors: string[],
  options: ReportOptions,
  charts: string[] = [],
) {
  const doc = await createPDF();
  let y = 35;
  function page() {
    doc.addPage();
    y = 24;
  }
  function text(str: string, size = 11) {
    doc.setFontSize(size);
    const lines: string[] = doc.splitTextToSize(str, 170);
    for (const line of lines) {
      if (y > 272) page();
      doc.text(line, 20, y);
      y += size * 0.45 + 1.7;
    }
    y += 3;
  }
  function heading(str: string) {
    if (y > 248) page();
    y += 5;
    text(str, 15);
  }
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(1);
  doc.line(20, 22, 45, 22);
  text("SCIENCE OS", 12);
  y = 65;
  text("НАУЧНО-ИССЛЕДОВАТЕЛЬСКАЯ РАБОТА", 12);
  y += 12;
  text(project.title, 25);
  text(project.science_category, 13);
  y += 15;
  if (options.authors) text("Авторы: " + (authors.join(", ") || "Не указаны"));
  text("Дата: " + date(new Date().toISOString()));
  y = 255;
  text("Исследовательское пространство Science OS", 10);
  page();
  for (const key of options.sections) {
    heading(sectionLabels[key]);
    text(
      String(
        project[key as keyof Project] ||
          "Раздел не заполнен автором исследования.",
      ),
    );
  }
  if (options.authors) {
    heading("Участники исследования");
    for (const author of authors) text(author);
  }
  for (const d of datasets) {
    if (!(options.tables || options.statistics)) break;
    if (y + 40 + Math.min(d.rows.length + 1, 13) * 7 > 270) page();
    heading(d.experiment.title);
    text(d.experiment.description || "Описание эксперимента не заполнено.");
    if (options.tables && d.parameters.length) {
      // Split wide tables into readable groups rather than squeezing arbitrary columns.
      for (let offset = 0; offset < d.parameters.length; offset += 5) {
        const params = d.parameters.slice(offset, offset + 5);
        if (offset > 0) heading("Продолжение таблицы");
        autoTable(doc, {
          startY: y,
          margin: { left: 20, right: 20, top: 24, bottom: 22 },
          head: [
            [
              "№",
              ...params.map((p) => p.name + (p.unit ? ` (${p.unit})` : "")),
            ],
          ],
          body: datasetMatrix(d).map((row, i) => [
            String(i + 1),
            ...row.slice(offset, offset + 5).map((v) => String(v ?? "—")),
          ]),
          styles: {
            font: "Roboto",
            fontStyle: "normal",
            fontSize: 9,
            cellPadding: 2,
            overflow: "linebreak",
          },
          headStyles: { fillColor: [37, 99, 235], fontStyle: "normal" },
          rowPageBreak: "avoid",
        });
        const last = doc as jsPDF & { lastAutoTable: { finalY: number } };
        y = last.lastAutoTable.finalY + 8;
      }
    }
    if (options.statistics) {
      heading("Статистические результаты");
      text(
        "Стандартное отклонение — выборочное (n − 1). При n < 2 не определено.",
        9,
      );
      for (const p of d.parameters.filter((p) => p.value_type === "number")) {
        const s = statistics(
          d.cells
            .filter((c) => c.experiment_parameter_id === p.id)
            .map((c) => c.value),
        );
        text(
          `${p.name}${p.unit ? " (" + p.unit + ")" : ""}: n = ${s.count}; минимум ${fmt(s.min)}; максимум ${fmt(s.max)}; среднее ${fmt(s.mean)}; медиана ${fmt(s.median)}; σ = ${fmt(s.std)}`,
          10,
        );
      }
    }
  }
  if (options.charts) {
    heading("Графики экспериментальных данных");
    if (!charts.length)
      text(
        "Сохранённых графиков нет. Создайте и сохраните конфигурацию в разделе «Аналитика».",
      );
    for (const image of charts) {
      const props = doc.getImageProperties(image),
        height = Math.min(220, (170 * props.height) / props.width),
        width = (height * props.width) / props.height;
      if (y + height > 270) page();
      doc.addImage(image, "PNG", 20, y, width, height);
      y += height + 10;
    }
  }
  const pages = doc.getNumberOfPages();
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n);
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("Science OS", 20, 286);
    doc.text(`${n} / ${pages}`, 190, 286, { align: "right" });
  }
  return doc;
}
export function fmt(n: number | null) {
  return n === null
    ? "—"
    : !Number.isFinite(n)
      ? "Вне диапазона"
      : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 5 }).format(n);
}
