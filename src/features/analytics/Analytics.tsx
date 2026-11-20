import { read } from "../../lib/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  AreaChart,
  Line,
  Bar,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { Download, Save, ChartNoAxesCombined } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "../projects/Workspace";
import { insert, errorMessage } from "../../lib/api";
import { canEdit } from "../../lib/validation";
import { chartData, compatibleUnits, statistics } from "../../lib/statistics";
import { download } from "../../lib/data-files";
import { createPDF, fmt } from "../../lib/pdf";
import type {
  ChartConfig,
  Dataset,
  Experiment,
  SavedChart,
  Value,
} from "../../types";
import {
  Button,
  Empty,
  ErrorState,
  PageHeader,
  Skeleton,
} from "../../components/ui";
export const colors = [
  "#2563eb",
  "#8b5cf6",
  "#059669",
  "#ea580c",
  "#db2777",
  "#0891b2",
  "#b45309",
  "#4f46e5",
];
export function prepareChart(datasets: Dataset[], config: ChartConfig) {
  const chosen = datasets.filter((d) =>
      config.experimentIds.includes(d.experiment.id),
    ),
    series: { key: string; name: string; color: string; unit: string }[] = [],
    points: Record<string, Value>[] = [];
  let error = "";
  if (!chosen.length)
    return { points, series, error: "Выберите хотя бы один эксперимент." };
  const xUnits: string[] = [],
    yUnits: string[] = [],
    merged = new Map<string, Record<string, Value>>();
  for (const d of chosen) {
    const x = d.parameters.find((p) => p.name === config.xId),
      ys = d.parameters.filter(
        (p) => config.yIds.includes(p.name) && p.value_type === "number",
      );
    if (config.xId && !x) {
      error = `В эксперименте «${d.experiment.title}» нет параметра ${config.xId}`;
      break;
    }
    if (ys.length !== config.yIds.length) {
      error = `Не все показатели доступны в эксперименте «${d.experiment.title}»`;
      break;
    }
    xUnits.push(x?.unit ?? "");
    yUnits.push(...ys.map((p) => p.unit));
    const data = chartData(
        d,
        x?.id ?? "",
        ys.map((p) => p.id),
        config.from,
        config.to || d.rows.length,
      ),
      seen = new Set<string>();
    for (const p of ys)
      series.push({
        key: `${d.experiment.id}:${p.id}`,
        name: `${chosen.length > 1 ? d.experiment.title + " · " : ""}${p.name}${p.unit ? " (" + p.unit + ")" : ""}`,
        color: colors[series.length % colors.length],
        unit: p.unit,
      });
    for (const point of data) {
      const key = String(point.x);
      if (chosen.length > 1 && seen.has(key)) {
        error =
          "Для сравнения значения оси X внутри каждого эксперимента должны быть уникальными.";
        break;
      }
      seen.add(key);
      const result =
        chosen.length > 1
          ? (merged.get(key) ?? { x: point.x })
          : { x: point.x };
      for (const p of ys) result[`${d.experiment.id}:${p.id}`] = point[p.id];
      if (chosen.length > 1) merged.set(key, result);
      else points.push(result);
    }
  }
  if (chosen.length > 1)
    points.push(
      ...[...merged.values()].sort((a, b) =>
        typeof a.x === "number" && typeof b.x === "number"
          ? a.x - b.x
          : String(a.x).localeCompare(String(b.x)),
      ),
    );
  if (!compatibleUnits(xUnits) || !compatibleUnits(yUnits))
    error =
      "Единицы измерения несовместимы. Выберите показатели с одинаковыми единицами.";
  if (!series.length && !error) error = "Выберите числовой показатель Y.";
  if (!points.length && !error) error = "В выбранном диапазоне нет наблюдений.";
  return { points, series, error, xUnit: xUnits[0] ?? "" };
}
export function ResearchChart({
  datasets,
  config,
}: {
  datasets: Dataset[];
  config: ChartConfig;
}) {
  const data = useMemo(
      () => prepareChart(datasets, config),
      [datasets, config],
    ),
    [hidden, setHidden] = useState<string[]>([]);
  if (data.error)
    return <Empty title="Нужны подходящие данные" text={data.error} />;
  const axes = (
    <>
      <CartesianGrid
        strokeDasharray="3 4"
        vertical={false}
        stroke="var(--border)"
      />
      <XAxis
        dataKey="x"
        type={
          data.points.every((p) => typeof p.x === "number")
            ? "number"
            : "category"
        }
        domain={["dataMin", "dataMax"]}
        tick={{ fill: "var(--muted)", fontSize: 12 }}
        height={50}
        label={{
          value: `${config.xId || "Наблюдение"}${data.xUnit ? " (" + data.xUnit + ")" : ""}`,
          position: "insideBottom",
          offset: 0,
          fill: "var(--muted)",
        }}
      />
      <YAxis
        width={70}
        tick={{ fill: "var(--muted)", fontSize: 12 }}
        label={{
          value: data.series[0]?.unit || "Значение",
          angle: -90,
          position: "insideLeft",
          fill: "var(--muted)",
        }}
      />
      <Tooltip
        contentStyle={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
        }}
      />
      <Legend
        wrapperStyle={{ paddingTop: 16, fontSize: 13, cursor: "pointer" }}
        onClick={(e) => {
          const key = String(e.dataKey);
          setHidden((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
          );
        }}
      />
    </>
  );
  return (
    <div className="research-chart" data-testid="research-chart">
      <ResponsiveContainer width="100%" height="100%">
        {config.type === "bar" ? (
          <BarChart
            data={data.points}
            margin={{ top: 15, right: 25, bottom: 20, left: 0 }}
          >
            {axes}
            {data.series.map((s) => (
              <Bar
                isAnimationActive={false}
                key={s.key}
                dataKey={s.key}
                name={s.name}
                fill={s.color}
                hide={hidden.includes(s.key)}
                radius={[3, 3, 0, 0]}
              />
            ))}
          </BarChart>
        ) : config.type === "area" ? (
          <AreaChart
            data={data.points}
            margin={{ top: 15, right: 25, bottom: 20, left: 0 }}
          >
            {axes}
            {data.series.map((s) => (
              <Area
                isAnimationActive={false}
                key={s.key}
                type="linear"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.22}
                stackId="total"
                hide={hidden.includes(s.key)}
              />
            ))}
          </AreaChart>
        ) : (
          <LineChart
            data={data.points}
            margin={{ top: 15, right: 25, bottom: 20, left: 0 }}
          >
            {axes}
            {data.series.map((s) => (
              <Line
                isAnimationActive={false}
                key={s.key}
                type="linear"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={data.points.length < 100}
                connectNulls
                hide={hidden.includes(s.key)}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
export async function chartPNG(node: HTMLElement) {
  const { toPng } = await import("html-to-image");
  return toPng(node, {
    backgroundColor:
      getComputedStyle(document.documentElement)
        .getPropertyValue("--surface")
        .trim() || "#ffffff",
    pixelRatio: 2,
  });
}
export default function Analytics() {
  const { project, role } = useWorkspace(),
    q = useQuery({
      queryKey: ["analytics", project.id],
      queryFn: async ({ signal }) =>
        Promise.all(
          (
            await read(signal).list<Experiment>("experiments", {
              project_id: project.id,
            })
          ).map(read(signal).dataset),
        ),
    }),
    saved = useQuery({
      queryKey: ["charts", project.id],
      queryFn: ({ signal }) =>
        read(signal).list<SavedChart>("saved_charts", {
          project_id: project.id,
        }),
    }),
    [draft, setDraft] = useState<ChartConfig>({
      experimentIds: [],
      xId: "",
      yIds: [],
      type: "line",
      from: 0,
      to: 0,
      title: "Результаты исследования",
    }),
    [config, setConfig] = useState<ChartConfig>(draft),
    [busy, setBusy] = useState(false),
    chart = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (q.data?.length && !draft.experimentIds.length) {
      const d = q.data[0],
        numeric = d.parameters.filter((p) => p.value_type === "number"),
        v: ChartConfig = {
          ...draft,
          experimentIds: [d.experiment.id],
          xId: numeric[0]?.name ?? "",
          yIds: numeric.slice(1, 2).map((p) => p.name),
        };
      setDraft(v);
      setConfig(v);
    }
  }, [q.data, draft]);
  const first = q.data?.find((d) =>
      draft.experimentIds.includes(d.experiment.id),
    ),
    prepared = prepareChart(q.data ?? [], config);
  async function exporting(format: string) {
    if (!chart.current || prepared.error) return;
    setBusy(true);
    try {
      if (format === "svg") {
        const svg = Array.from(
          chart.current.querySelectorAll<SVGSVGElement>("svg.recharts-surface"),
        ).sort((a, b) => {
          const x = a.getBoundingClientRect(),
            y = b.getBoundingClientRect();
          return y.width * y.height - x.width * x.height;
        })[0];
        if (!svg) throw new Error("График не построен");
        const clone = svg.cloneNode(true) as SVGElement;
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        const width = Number(svg.getAttribute("width")) || 900,
          height = Number(svg.getAttribute("height")) || 450;
        const esc = (s: string) =>
          s.replace(
            /[&<>"']/g,
            (c) =>
              ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&apos;",
              })[c]!,
          );
        const result = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + 120}"><style>:root{--muted:#64748b;--border:#e2e8f0;--text:#334155}text{font-family:Arial,sans-serif}</style><rect width="100%" height="100%" fill="white"/><text x="20" y="25" font-family="sans-serif" font-size="18">${esc(config.title)}</text><svg x="0" y="40">${clone.innerHTML}</svg><text x="20" y="${height + 75}" font-family="sans-serif" font-size="12">${esc(prepared.series.map((s) => s.name).join(" · "))}</text></svg>`;
        download(
          new Blob([result], { type: "image/svg+xml" }),
          "science-chart.svg",
        );
      } else {
        const png = await chartPNG(chart.current);
        if (format === "png") {
          const a = document.createElement("a");
          a.href = png;
          a.download = "science-chart.png";
          a.click();
        } else {
          const pdf = await createPDF();
          pdf.setFontSize(16);
          pdf.text(pdf.splitTextToSize(config.title, 170), 20, 24);
          const props = pdf.getImageProperties(png),
            height = Math.min(220, (170 * props.height) / props.width);
          pdf.addImage(
            png,
            "PNG",
            20,
            40,
            (height * props.width) / props.height,
            height,
          );
          pdf.save("science-chart.pdf");
        }
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (q.isLoading) return <Skeleton />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <>
      <PageHeader
        title="Аналитика исследования"
        description="Найдите закономерности. Сравните результаты. Проверьте гипотезу."
        action={
          <details className="dropdown">
            <summary className="button secondary">
              <Download size={17} />
              Экспортировать график
            </summary>
            <div>
              {["png", "svg", "pdf"].map((f) => (
                <button
                  disabled={busy || !!prepared.error}
                  key={f}
                  onClick={() => void exporting(f)}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </details>
        }
      />
      {!q.data?.length ? (
        <Empty
          title="Данные расскажут свою историю"
          text="Добавьте эксперимент и числовые параметры, чтобы построить первый график."
        />
      ) : (
        <>
          <section className="card chart-controls">
            <div className="form-grid">
              <label className="field">
                <span>Заголовок графика</span>
                <input
                  value={draft.title}
                  maxLength={200}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Тип графика</span>
                <select
                  aria-label="Тип графика"
                  value={draft.type}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      type: e.target.value as ChartConfig["type"],
                    })
                  }
                >
                  <option value="line">Линейный</option>
                  <option value="bar">Столбчатый</option>
                  <option value="area">Накопительный</option>
                  <option value="comparison">Сравнение экспериментов</option>
                </select>
              </label>
            </div>
            <fieldset>
              <legend>Эксперименты</legend>
              <div className="checkbox-row">
                {q.data.map((d) => (
                  <label key={d.experiment.id}>
                    <input
                      type="checkbox"
                      checked={draft.experimentIds.includes(d.experiment.id)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          experimentIds: e.target.checked
                            ? [...draft.experimentIds, d.experiment.id]
                            : draft.experimentIds.filter(
                                (id) => id !== d.experiment.id,
                              ),
                        })
                      }
                    />
                    {d.experiment.title}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="chart-axis-controls">
              <label className="field">
                <span>Ось X</span>
                <select
                  aria-label="Ось X"
                  value={draft.xId}
                  onChange={(e) => setDraft({ ...draft, xId: e.target.value })}
                >
                  <option value="">Номер наблюдения</option>
                  {first?.parameters.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                      {p.unit ? " (" + p.unit + ")" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend>Показатели Y</legend>
                <div className="checkbox-row">
                  {first?.parameters
                    .filter((p) => p.value_type === "number")
                    .map((p) => (
                      <label key={p.id}>
                        <input
                          type="checkbox"
                          checked={draft.yIds.includes(p.name)}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              yIds: e.target.checked
                                ? [...draft.yIds, p.name]
                                : draft.yIds.filter((n) => n !== p.name),
                            })
                          }
                        />
                        {p.name}
                        {p.unit ? " (" + p.unit + ")" : ""}
                      </label>
                    ))}
                </div>
              </fieldset>
              <label className="field">
                <span>Со строки</span>
                <input
                  type="number"
                  min={1}
                  value={draft.from + 1}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      from: Math.max(0, Number(e.target.value) - 1),
                    })
                  }
                />
              </label>
              <label className="field">
                <span>По строку (0 — все)</span>
                <input
                  type="number"
                  min={0}
                  value={draft.to}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      to: Math.max(0, Number(e.target.value)),
                    })
                  }
                />
              </label>
            </div>
            <div className="row-actions">
              <Button variant="primary" onClick={() => setConfig(draft)}>
                <ChartNoAxesCombined size={17} />
                Построить
              </Button>
              {canEdit(role) && (
                <Button
                  disabled={!!prepared.error || busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await insert("saved_charts", {
                        project_id: project.id,
                        title: config.title,
                        chart_type: config.type,
                        configuration: config,
                      });
                      await saved.refetch();
                      toast.success("График сохранён");
                    } catch (e) {
                      toast.error(errorMessage(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Save size={16} />
                  Сохранить конфигурацию
                </Button>
              )}
              {!!saved.data?.length && (
                <select
                  aria-label="Сохранённые графики"
                  value=""
                  onChange={(e) => {
                    const s = saved.data?.find((s) => s.id === e.target.value);
                    if (s) {
                      setDraft(s.configuration);
                      setConfig(s.configuration);
                    }
                  }}
                >
                  <option value="">Открыть сохранённый…</option>
                  {saved.data.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </section>
          <section className="card chart-card" ref={chart}>
            <div className="section-heading">
              <h2>{config.title}</h2>
              <span className="muted">Экспериментальные данные</span>
            </div>
            <ResearchChart datasets={q.data} config={config} />
            <small className="muted">
              Линии соединяют доступные измерения. Отсутствующие значения не
              заменяются нулями.
            </small>
          </section>
          {!prepared.error && (
            <section className="statistics-section">
              <h2>Описательная статистика</h2>
              <p className="muted">
                Стандартное отклонение — выборочное (n − 1). При n &lt; 2 не
                определено. Пропущенные значения исключены.
              </p>
              {prepared.series.map((s) => {
                const stats = statistics(prepared.points.map((p) => p[s.key]));
                return (
                  <div className="card statistics-card" key={s.key}>
                    <h3 style={{ color: s.color }}>{s.name}</h3>
                    <div className="statistics-grid">
                      {Object.entries({
                        Наблюдений: stats.count,
                        Минимум: stats.min,
                        Максимум: stats.max,
                        Среднее: stats.mean,
                        Медиана: stats.median,
                        "Станд. отклонение": stats.std,
                      }).map(([label, value]) => (
                        <div key={label}>
                          <span>{label}</span>
                          <strong>{fmt(value)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          )}
        </>
      )}
    </>
  );
}
