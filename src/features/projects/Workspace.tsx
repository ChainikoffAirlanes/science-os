import { read } from "../../lib/api";
import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useOutletContext,
  useParams,
  useSearchParams,
  useNavigate,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UsersRound, Share2, Pencil, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useProject, useRealtime } from "../../hooks/useProject";
import { update, remove, ConflictError, errorMessage } from "../../lib/api";
import {
  canEdit,
  date,
  statuses,
  sectionLabels,
  categories,
} from "../../lib/validation";
import { appUrl } from "../../lib/supabase";
import type {
  Project,
  Role,
  Activity,
  Experiment,
  Member,
  Task,
} from "../../types";
import {
  Confirm,
  Badge,
  Button,
  DataForm,
  ErrorState,
  Modal,
  PageHeader,
  Skeleton,
} from "../../components/ui";
export interface ProjectContext {
  project: Project;
  role: Role | undefined;
  online: { id: string; name: string }[];
  connected: boolean;
}
export function useWorkspace() {
  return useOutletContext<ProjectContext>();
}
const tabs = [
  ["", "Обзор"],
  ["experiments", "Эксперименты"],
  ["analytics", "Аналитика"],
  ["files", "Файлы"],
  ["team", "Команда"],
  ["tasks", "Задачи"],
  ["report", "Отчёт"],
];
export function Workspace() {
  const [searchParams] = useSearchParams();
  const { id = "" } = useParams(),
    q = useProject(id),
    presence = useRealtime(q.data ? id : ""),
    [edit, setEdit] = useState(searchParams.get("edit") === "1"),
    [settingsVersion, setSettingsVersion] = useState(0),
    [menu, setMenu] = useState(false),
    [deleting, setDeleting] = useState(false),
    navigate = useNavigate(),
    client = useQueryClient();
  useEffect(() => {
    if (edit && q.data && !settingsVersion) setSettingsVersion(q.data.version);
  }, [edit, q.data, settingsVersion]);
  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data)
    return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  const project = q.data;
  return (
    <>
      <div className="project-breadcrumb">
        <Link to="/projects">Мои проекты</Link>
        <span>/</span>
        <span>{project.science_category}</span>
      </div>
      <PageHeader
        title={project.title}
        description={project.description}
        action={
          <>
            <Badge tone={project.status === "active" ? "blue" : "neutral"}>
              {statuses[project.status]}
            </Badge>
            {canEdit(q.role) && (
              <Button
                aria-label="Редактировать проект"
                onClick={() => {
                  setSettingsVersion(project.version);
                  setEdit(true);
                }}
              >
                <Pencil size={16} />
              </Button>
            )}
            {q.role === "owner" && (
              <Button
                aria-label="Действия проекта"
                onClick={() => setMenu(true)}
              >
                <MoreHorizontal size={17} />
              </Button>
            )}
            <Button asChild>
              <Link to="team">
                <UsersRound size={17} />
                Команда
              </Link>
            </Button>
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(appUrl(`/projects/${id}`));
                toast.success(
                  "Ссылка скопирована. Доступ есть только у участников.",
                );
              }}
            >
              <Share2 size={17} />
              <span className="desktop-label">Поделиться</span>
            </Button>
          </>
        }
      />
      <nav className="project-tabs" aria-label="Разделы проекта">
        {tabs.map(([path, label]) => (
          <NavLink
            end={path === ""}
            key={path}
            to={`/projects/${id}${path ? "/" + path : ""}`}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet
        context={
          { project, role: q.role, ...presence } satisfies ProjectContext
        }
      />
      <Modal open={menu} onOpenChange={setMenu} title="Действия проекта">
        <div className="row-actions">
          <Button
            onClick={() => {
              setMenu(false);
              setSettingsVersion(project.version);
              setEdit(true);
            }}
          >
            Настройки проекта
          </Button>
          <Button
            onClick={async () => {
              try {
                await update(
                  "projects",
                  id,
                  {
                    status:
                      project.status === "archived" ? "active" : "archived",
                  },
                  project.version,
                );
                await client.invalidateQueries({ queryKey: ["project", id] });
                await client.invalidateQueries({ queryKey: ["projects"] });
                setMenu(false);
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
          >
            {project.status === "archived" ? "Вернуть в работу" : "В архив"}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setMenu(false);
              setDeleting(true);
            }}
          >
            Удалить проект
          </Button>
        </div>
      </Modal>
      <Confirm
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Удалить исследование?"
        text="Удалятся проект, эксперименты и результаты. Сначала удалите файлы проекта из хранилища."
        onConfirm={async () => {
          await remove("projects", id);
          await client.invalidateQueries({ queryKey: ["projects"] });
          navigate("/projects");
        }}
      />
      <Modal
        open={edit && canEdit(q.role)}
        onOpenChange={setEdit}
        title="Настройки исследования"
      >
        <DataForm
          initial={{
            title: project.title,
            status: project.status,
            science_category: project.science_category,
            start_date: project.start_date ?? "",
            due_date: project.due_date ?? "",
          }}
          fields={[
            { name: "title", label: "Название", required: true },
            {
              name: "science_category",
              label: "Научная область",
              type: "select",
              options: categories.map((value) => ({ value, label: value })),
            },
            { name: "start_date", label: "Дата начала", type: "date" },
            { name: "due_date", label: "Срок завершения", type: "date" },
            {
              name: "status",
              label: "Статус",
              type: "select",
              options: Object.entries(statuses)
                .slice(0, 4)
                .map(([value, label]) => ({ value, label })),
            },
          ]}
          onSave={async (v) => {
            if (v.start_date && v.due_date && v.due_date < v.start_date)
              throw new Error("Завершение не может быть раньше начала");
            await update(
              "projects",
              id,
              {
                ...v,
                start_date: v.start_date || null,
                due_date: v.due_date || null,
              },
              settingsVersion || project.version,
            );
            await client.invalidateQueries({ queryKey: ["project", id] });
            await client.invalidateQueries({ queryKey: ["projects"] });
            setEdit(false);
            toast.success("Проект сохранён");
          }}
        />
      </Modal>
    </>
  );
}
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      {text.split("\n").map((line, i) =>
        line.startsWith("## ") ? (
          <h3 key={i}>{line.slice(3)}</h3>
        ) : line.startsWith("# ") ? (
          <h2 key={i}>{line.slice(2)}</h2>
        ) : line.startsWith("- ") ? (
          <div className="list-line" key={i}>
            • {line.slice(2)}
          </div>
        ) : (
          <p key={i}>{line || "\u00a0"}</p>
        ),
      )}
    </div>
  );
}
export function Overview() {
  const { project: p, role } = useWorkspace(),
    [editing, setEditing] = useState(""),
    [editVersion, setEditVersion] = useState(0),
    [text, setText] = useState(""),
    [conflict, setConflict] = useState<Project | null>(null),
    [busy, setBusy] = useState(false),
    client = useQueryClient();
  const activity = useQuery({
      queryKey: ["activity", p.id],
      queryFn: ({ signal }) =>
        read(signal).list<Activity>(
          "activity_log",
          { project_id: p.id },
          "created_at",
          15,
        ),
    }),
    members = useQuery({
      queryKey: ["members", p.id],
      queryFn: ({ signal }) =>
        read(signal).list<Member>("project_members", { project_id: p.id }),
    }),
    experiments = useQuery({
      queryKey: ["experiments", p.id],
      queryFn: ({ signal }) =>
        read(signal).list<Experiment>("experiments", { project_id: p.id }),
    }),
    tasks = useQuery({
      queryKey: ["tasks", p.id],
      queryFn: ({ signal }) =>
        read(signal).list<Task>("tasks", { project_id: p.id }),
    });
  return (
    <div className="overview-grid">
      <section className="research-blocks">
        {Object.entries(sectionLabels).map(([key, label]) => (
          <article className="card research-block" key={key}>
            <div className="section-heading">
              <h2>{label}</h2>
              {canEdit(role) && (
                <Button
                  variant="ghost"
                  aria-label={`Редактировать: ${label}`}
                  onClick={() => {
                    setEditing(key);
                    setEditVersion(p.version);
                    setText(p[key as keyof Project] as string);
                    setConflict(null);
                  }}
                >
                  <Pencil size={16} />
                </Button>
              )}
            </div>
            {p[key as keyof Project] ? (
              <Markdown text={p[key as keyof Project] as string} />
            ) : (
              <p className="muted">Раздел не заполнен автором исследования.</p>
            )}
          </article>
        ))}
      </section>
      <aside>
        <section className="card summary-card">
          <h2>Об исследовании</h2>
          <dl>
            <dt>Статус</dt>
            <dd>
              <Badge tone="blue">{statuses[p.status]}</Badge>
            </dd>
            <dt>Научная область</dt>
            <dd>{p.science_category}</dd>
            <dt>Участники</dt>
            <dd>{(members.data?.length ?? 0) + 1}</dd>
            <dt>Дата начала</dt>
            <dd>{date(p.start_date)}</dd>
            <dt>Срок</dt>
            <dd>{date(p.due_date)}</dd>
            <dt>Обновлено</dt>
            <dd>{date(p.updated_at)}</dd>
            <dt>Эксперименты</dt>
            <dd>{experiments.data?.length ?? "—"}</dd>
            <dt>Задачи выполнены</dt>
            <dd>
              {tasks.data?.filter((t) => t.status === "done").length ?? 0} /{" "}
              {tasks.data?.length ?? 0}
            </dd>
          </dl>
        </section>
        <section className="card activity-card">
          <h2>Последние изменения</h2>
          {activity.data?.length ? (
            activity.data.map((a) => (
              <div className="activity-item" key={a.id}>
                <span className="activity-dot" />
                <div>
                  <strong>
                    {{
                      INSERT: "Добавлена запись",
                      UPDATE: "Обновлена запись",
                      DELETE: "Удалена запись",
                    }[a.action] ?? a.action}
                  </strong>
                  <small>
                    {{
                      projects: "Исследование",
                      experiment_cells: "Ячейка таблицы",
                      tasks: "Задача",
                      experiments: "Эксперимент",
                      project_members: "Участник",
                      experiment_rows: "Наблюдение",
                      experiment_parameters: "Параметр",
                      project_files: "Файл",
                      task_comments: "Комментарий",
                    }[a.entity_type] ?? a.entity_type}{" "}
                    · {date(a.created_at)}
                  </small>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">История появится после первых действий.</p>
          )}
        </section>
      </aside>
      <Modal
        open={!!editing}
        onOpenChange={(v) => !v && !busy && setEditing("")}
        title={sectionLabels[editing] ?? ""}
        description="Можно использовать # заголовок, ## подзаголовок и - списки."
      >
        <div className="editor-tools">
          {[
            ["Заголовок", "\n## "],
            ["Список", "\n- "],
            ["Абзац", "\n\n"],
          ].map(([label, syntax]) => (
            <Button key={label} onClick={() => setText(text + syntax)}>
              {label}
            </Button>
          ))}
        </div>
        <textarea
          aria-label="Текст раздела"
          rows={12}
          maxLength={editing === "description" ? 10000 : 30000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {conflict && (
          <div className="conflict-panel" role="alert">
            <strong>Конфликт изменений</strong>
            <p>Серверная версия:</p>
            <Markdown text={conflict[editing as keyof Project] as string} />
            <p>
              Ваш текст сохранён в редакторе. Нажмите «Сохранить поверх новой
              версии», только если хотите заменить показанный текст.
            </p>
            <Button
              onClick={() => {
                client.setQueryData(["project", p.id], conflict);
                void client.invalidateQueries({ queryKey: ["projects"] });
                setText(conflict[editing as keyof Project] as string);
                setConflict(null);
                setEditing("");
              }}
            >
              Принять серверную версию
            </Button>
          </div>
        )}
        <div className="form-actions">
          <Button disabled={busy} onClick={() => setEditing("")}>
            Отмена
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await update<Project>(
                  "projects",
                  p.id,
                  { [editing]: text },
                  conflict?.version ?? editVersion,
                );
                await client.invalidateQueries({ queryKey: ["project", p.id] });
                setEditing("");
                toast.success("Раздел сохранён");
              } catch (e) {
                if (e instanceof ConflictError)
                  setConflict(e.current as Project);
                else toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? "Сохранение…"
              : conflict
                ? "Сохранить поверх новой версии"
                : "Сохранить"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
