import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "../projects/Workspace";
import { chartPNG, ResearchChart } from "../analytics/Analytics";
import { dataset, list, one, errorMessage, insert } from "../../lib/api";
import {
  canEdit,
  date,
  sectionLabels,
  researchTypes,
} from "../../lib/validation";
import { defaultReportOptions, reportPDF } from "../../lib/pdf";
import type { ReportOptions } from "../../lib/pdf";
import { datasetMatrix } from "../../lib/data-files";
import type {
  Experiment,
  Member,
  Profile,
  Publication,
  SavedChart,
} from "../../types";
import {
  Badge,
  Button,
  ErrorState,
  Modal,
  PageHeader,
  Skeleton,
} from "../../components/ui";
import { Markdown } from "../projects/Workspace";
export default function Report() {
  const { project, role } = useWorkspace(),
    [options, setOptions] = useState<ReportOptions>(defaultReportOptions),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [publish, setPublish] = useState(false),
    [visibility, setVisibility] = useState("private"),
    [researchType, setResearchType] = useState(researchTypes[0]),
    [includeTables, setIncludeTables] = useState(false),
    [includeAuthors, setIncludeAuthors] = useState(false),
    [approved, setApproved] = useState(false),
    [sections, setSections] = useState([
      "description",
      "objectives",
      "conclusions",
    ]),
    charts = useRef<HTMLDivElement>(null);
  const q = useQuery({
    queryKey: ["report-data", project.id],
    queryFn: async () => {
      const [experiments, members, saved] = await Promise.all([
        list<Experiment>("experiments", { project_id: project.id }),
        list<Member>("project_members", { project_id: project.id }),
        list<SavedChart>("saved_charts", { project_id: project.id }),
      ]);
      const [datasets, authors] = await Promise.all([
        Promise.all(experiments.map(dataset)),
        Promise.all(
          [project.owner_id, ...members.map((m) => m.user_id)].map((id) =>
            one<Profile>("profiles", id),
          ),
        ),
      ]);
      return { datasets, authors, saved };
    },
  });
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function generate(download = false) {
    if (!q.data) return;
    setBusy(true);
    try {
      const images: string[] = [];
      if (options.charts && charts.current)
        for (const child of Array.from(charts.current.children))
          images.push(await chartPNG(child as HTMLElement));
      const pdf = await reportPDF(
        project,
        q.data.datasets,
        q.data.authors.map((p) => p.display_name),
        options,
        images,
      );
      if (download) pdf.save("science-report.pdf");
      else setPreview(URL.createObjectURL(pdf.output("blob")));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const data = q.data;
  return (
    <>
      <PageHeader
        title="Научный отчёт"
        description="Воспроизводимый документ из реальных данных вашего исследования."
        action={
          <>
            <Button onClick={() => window.print()}>
              <Printer size={17} />
              Печать
            </Button>
            <Button disabled={busy} onClick={() => void generate()}>
              <Eye size={17} />
              Предпросмотр PDF
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void generate(true)}
            >
              <Download size={17} />
              {busy ? "Подготовка…" : "Скачать PDF"}
            </Button>
          </>
        }
      />
      <div className="report-layout">
        <aside className="card report-settings">
          <h3>Содержание отчёта</h3>
          {Object.entries(sectionLabels).map(([key, label]) => (
            <label className="checkbox-label" key={key}>
              <input
                type="checkbox"
                checked={options.sections.includes(key)}
                onChange={(e) =>
                  setOptions({
                    ...options,
                    sections: e.target.checked
                      ? [...options.sections, key]
                      : options.sections.filter((k) => k !== key),
                  })
                }
              />
              {label}
            </label>
          ))}
          {(["tables", "charts", "statistics", "authors"] as const).map(
            (key) => (
              <label className="checkbox-label" key={key}>
                <input
                  type="checkbox"
                  checked={options[key]}
                  onChange={(e) =>
                    setOptions({ ...options, [key]: e.target.checked })
                  }
                />
                {
                  {
                    tables: "Таблицы",
                    charts: "Сохранённые графики",
                    statistics: "Статистика",
                    authors: "Участники",
                  }[key]
                }
              </label>
            ),
          )}
          <p className="muted">
            Все тексты и выводы берутся из проекта. Приложение не дописывает
            результаты за автора.
          </p>
          {role === "owner" && (
            <Button onClick={() => setPublish(true)}>
              <Share2 size={16} />
              Опубликовать работу
            </Button>
          )}
        </aside>
        <article className="report-paper">
          <div className="paper-cover">
            <div className="eyebrow">SCIENCE OS / НАУЧНОЕ ИССЛЕДОВАНИЕ</div>
            <h1>{project.title}</h1>
            <p>{project.science_category}</p>
            {options.authors && (
              <p>{data.authors.map((p) => p.display_name).join(", ")}</p>
            )}
            <small>{date(new Date().toISOString())}</small>
            <Badge tone="blue">Предпросмотр содержания</Badge>
          </div>
          {options.sections.map((key) => (
            <section key={key}>
              <h2>{sectionLabels[key]}</h2>
              <Markdown
                text={
                  (project[key as keyof typeof project] as string) ||
                  "Раздел не заполнен автором исследования."
                }
              />
            </section>
          ))}
          {options.tables &&
            data.datasets.map((d) => (
              <section key={d.experiment.id}>
                <h2>{d.experiment.title}</h2>
                <div className="table-scroll">
                  <table className="preview-table">
                    <thead>
                      <tr>
                        {d.parameters.map((p) => (
                          <th key={p.id}>
                            {p.name} {p.unit && `(${p.unit})`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {datasetMatrix(d)
                        .slice(0, 20)
                        .map((r, i) => (
                          <tr key={i}>
                            {r.map((v, j) => (
                              <td key={j}>{String(v ?? "—")}</td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {d.rows.length > 20 && (
                  <small>
                    Показаны первые 20 наблюдений. PDF содержит все строки.
                  </small>
                )}
              </section>
            ))}
          <div ref={charts}>
            {options.charts &&
              data.saved.map((s) => (
                <section className="report-chart" key={s.id}>
                  <h3>{s.title}</h3>
                  <ResearchChart
                    datasets={data.datasets}
                    config={s.configuration}
                  />
                </section>
              ))}
          </div>
        </article>
      </div>
      <Modal
        open={!!preview}
        onOpenChange={(v) => !v && setPreview("")}
        title="Предпросмотр научного отчёта"
      >
        <iframe
          className="pdf-preview large"
          src={preview}
          title="PDF научного отчёта"
        />
      </Modal>
      <Modal
        open={publish}
        onOpenChange={setPublish}
        title="Публикация исследования"
        description="Будет создан отдельный снимок выбранных материалов. Исходный проект и приватные файлы останутся закрытыми."
      >
        <label className="field">
          <span>Видимость</span>
          <select
            aria-label="Видимость"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
          >
            <option value="private">Только владелец</option>
            <option value="authenticated">
              Все зарегистрированные пользователи
            </option>
            <option value="public">Все, включая посетителей без входа</option>
          </select>
        </label>
        <p className="muted">
          Регистрация не подтверждает принадлежность к школе. Строгая школьная
          изоляция в этой установке не настроена.
        </p>
        <label className="field">
          <span>Тип исследования</span>
          <select
            aria-label="Тип исследования"
            value={researchType}
            onChange={(e) => setResearchType(e.target.value)}
          >
            {researchTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <h3>Разделы, которые будут опубликованы</h3>
        {Object.entries(sectionLabels).map(([key, label]) => (
          <label className="checkbox-label" key={key}>
            <input
              type="checkbox"
              checked={sections.includes(key)}
              onChange={(e) =>
                setSections(
                  e.target.checked
                    ? [...sections, key]
                    : sections.filter((k) => k !== key),
                )
              }
            />
            {label}
          </label>
        ))}
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={includeTables}
            onChange={(e) => setIncludeTables(e.target.checked)}
          />
          Все экспериментальные таблицы
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={includeAuthors}
            onChange={(e) => setIncludeAuthors(e.target.checked)}
          />
          Имена участников (только с их согласием)
        </label>
        <div className="publication-preview">
          <h3>{project.title}</h3>
          {sections.map((k) => (
            <section key={k}>
              <strong>{sectionLabels[k]}</strong>
              <p>
                {String(
                  project[k as keyof typeof project] ||
                    "Раздел не заполнен автором исследования.",
                )}
              </p>
            </section>
          ))}
          {includeAuthors && (
            <p>Авторы: {data.authors.map((p) => p.display_name).join(", ")}</p>
          )}
          {includeTables && (
            <p>
              Таблиц: {data.datasets.length} · Наблюдений:{" "}
              {data.datasets.reduce((s, d) => s + d.rows.length, 0)}
            </p>
          )}
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={approved}
            onChange={(e) => setApproved(e.target.checked)}
          />
          Я проверил материалы и согласия участников. Выбранные тексты и таблицы
          могут содержать личные сведения; я разрешаю их публикацию для
          выбранной аудитории.
        </label>
        <div className="form-actions">
          <Button onClick={() => setPublish(false)}>Отмена</Button>
          <Button
            variant="primary"
            disabled={!approved || busy || !canEdit(role)}
            onClick={async () => {
              setBusy(true);
              try {
                const public_content: Publication["public_content"] = {
                  category: project.science_category,
                  research_type: researchType,
                  authors: includeAuthors
                    ? data.authors.map((p) => p.display_name)
                    : [],
                  sections: Object.fromEntries(
                    sections.map((k) => [
                      k,
                      String(project[k as keyof typeof project] ?? ""),
                    ]),
                  ),
                };
                if (includeTables)
                  public_content.experiments = data.datasets.map((d) => ({
                    title: d.experiment.title,
                    parameters: d.parameters.map((p) => ({ ...p })),
                    rows: datasetMatrix(d),
                  }));
                await insert("publications", {
                  project_id: project.id,
                  title: project.title,
                  abstract: sections.includes("description")
                    ? project.description
                    : "",
                  public_content,
                  visibility,
                });
                setPublish(false);
                toast.success("Публикация создана");
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Опубликовать снимок
          </Button>
        </div>
      </Modal>
    </>
  );
}
