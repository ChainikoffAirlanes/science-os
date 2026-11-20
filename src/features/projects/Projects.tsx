import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { read } from "../../lib/api";
import { db } from "../../lib/supabase";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  Plus,
  FolderKanban,
  FlaskConical,
  CheckCheck,
  Activity,
  Search,
  Grid2X2,
  List,
  CalendarDays,
  ArrowUpRight,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { insert, errorMessage, remove, update, rpc } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";
import {
  categories,
  statuses,
  projectSchema,
  date,
  sectionLabels,
} from "../../lib/validation";
import type { Project, Task, Experiment, Member, Profile } from "../../types";
import {
  Avatar,
  PageHeader,
  Button,
  Badge,
  Empty,
  Skeleton,
  ErrorState,
  Confirm,
} from "../../components/ui";
export function ProjectCard({
  project: p,
  experiments,
  members,
  onMenu,
}: {
  project: Project;
  experiments?: Experiment[];
  members?: Member[];
  onMenu?: () => void;
}) {
  const memberIds = [
    p.owner_id,
    ...(members ?? [])
      .filter((m) => m.project_id === p.id)
      .map((m) => m.user_id),
  ].slice(0, 4);
  const people = useQuery({
    queryKey: ["card-profiles", p.id, memberIds.join(",")],
    queryFn: async ({ signal }) => {
      const { data, error } = await db()
        .from("profiles")
        .select("id,display_name,avatar_path")
        .abortSignal(signal)
        .in("id", memberIds);
      if (error) throw error;
      return data as Pick<Profile, "id" | "display_name" | "avatar_path">[];
    },
  });
  return (
    <article className="project-card">
      <div className="project-card-top">
        <span
          className={`category-icon cat-${categories.indexOf(p.science_category) % 4}`}
        >
          <FlaskConical size={22} />
        </span>
        <Badge
          tone={
            p.status === "active"
              ? "blue"
              : p.status === "completed"
                ? "green"
                : "neutral"
          }
        >
          {statuses[p.status]}
        </Badge>
        {onMenu && (
          <Button
            variant="ghost"
            aria-label={`Действия: ${p.title}`}
            onClick={onMenu}
          >
            <MoreHorizontal size={18} />
          </Button>
        )}
      </div>
      <Link className="project-card-link" to={`/projects/${p.id}`}>
        <h3>{p.title}</h3>
        <p>{p.description || "Описание исследования пока не добавлено."}</p>
      </Link>
      <span className="category-label">{p.science_category}</span>
      <div className="project-card-bottom">
        <span>
          <FlaskConical size={15} />
          {experiments?.filter((e) => e.project_id === p.id).length ?? "—"}{" "}
          экспериментов
        </span>
        <span>
          {members
            ? members.filter((m) => m.project_id === p.id).length + 1
            : "—"}{" "}
          уч.
        </span>
      </div>
      <div className="avatar-group" aria-label="Участники проекта">
        {people.data?.map((person) => (
          <Avatar
            key={person.id}
            name={person.display_name}
            path={person.avatar_path}
            size={25}
          />
        ))}
      </div>
      <div className="project-card-date">
        <CalendarDays size={13} /> Обновлён {date(p.updated_at)}
      </div>
    </article>
  );
}
export function Dashboard() {
  const { profile, session } = useAuth(),
    q = useQuery({
      queryKey: ["projects"],
      queryFn: ({ signal }) => read(signal).list<Project>("projects"),
    }),
    tasks = useQuery({
      queryKey: ["all-tasks"],
      queryFn: ({ signal }) => read(signal).list<Task>("tasks"),
    }),
    experiments = useQuery({
      queryKey: ["all-experiments"],
      queryFn: ({ signal }) => read(signal).list<Experiment>("experiments"),
    }),
    members = useQuery({
      queryKey: ["all-members"],
      queryFn: ({ signal }) => read(signal).list<Member>("project_members"),
    });
  if (q.isLoading) return <Skeleton />;
  if (q.error)
    return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  const projects = q.data ?? [],
    myTasks =
      tasks.data?.filter(
        (t) => t.assigned_to === session?.user.id && t.status !== "done",
      ) ?? [];
  return (
    <>
      <PageHeader
        eyebrow="ВАШЕ ИССЛЕДОВАТЕЛЬСКОЕ ПРОСТРАНСТВО"
        title={`Добро пожаловать${profile?.first_name ? ", " + profile.first_name : ""}`}
        description="Превращайте идеи в исследования. Следите за тем, что важно."
        action={
          <Button asChild variant="primary">
            <Link to="/projects/new">
              <Plus size={18} />
              Создать проект
            </Link>
          </Button>
        }
      />
      <div className="kpi-grid">
        {[
          {
            title: "Мои проекты",
            value: projects.length,
            icon: FolderKanban,
            note: "В вашем пространстве",
          },
          {
            title: "Активные исследования",
            value: projects.filter((p) => p.status === "active").length,
            icon: Activity,
            note: "От идеи к результату",
          },
          {
            title: "Эксперименты",
            value: experiments.data?.length ?? "—",
            icon: FlaskConical,
            note: "Наблюдения и измерения",
          },
          {
            title: "Задачи к выполнению",
            value: tasks.isLoading ? "—" : myTasks.length,
            icon: CheckCheck,
            note: "Назначены вам",
          },
        ].map((k, i) => (
          <section className="kpi-card" key={k.title}>
            <div>
              <span>{k.title}</span>
              <k.icon size={18} />
            </div>
            <strong>{k.value}</strong>
            <small>
              <i className={`kpi-dot dot-${i}`} />
              {k.note}
            </small>
          </section>
        ))}
      </div>
      <div className="dashboard-grid">
        <section>
          <div className="section-heading">
            <h2>
              Недавние проекты <span>{projects.length}</span>
            </h2>
            <Link to="/projects">
              Все проекты <ArrowUpRight size={16} />
            </Link>
          </div>
          {projects.length ? (
            <div className="project-grid">
              {projects.slice(0, 6).map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  experiments={experiments.data}
                  members={members.data}
                />
              ))}
            </div>
          ) : (
            <div className="card">
              <Empty
                title="Ваше первое исследование начинается здесь"
                text="Сформулируйте вопрос, соберите команду и проверьте свою гипотезу."
                action={
                  <Button asChild variant="primary">
                    <Link to="/projects/new">
                      <Plus size={17} />
                      Создать первый проект
                    </Link>
                  </Button>
                }
              />
            </div>
          )}
          <div className="research-note">
            <div>
              <span className="eyebrow">
                МЕСТО ДЛЯ ВАШЕГО СЛЕДУЮЩЕГО «ПОЧЕМУ?»
              </span>
              <h3>Хороший вопрос — уже начало исследования.</h3>
              <p>
                Фиксируйте гипотезы, сохраняйте наблюдения и делитесь открытиями
                с командой.
              </p>
            </div>
            <FlaskConical size={70} />
          </div>
        </section>
        <aside className="dashboard-tasks card">
          <div className="section-heading">
            <h2>Мои задачи</h2>
            <CheckCheck size={18} />
          </div>
          {tasks.error ? (
            <ErrorState error={tasks.error} />
          ) : !myTasks.length ? (
            <Empty
              title="Всё под контролем"
              text="Здесь появятся назначенные вам задачи."
            />
          ) : (
            myTasks.slice(0, 6).map((t) => (
              <Link
                key={t.id}
                className="task-summary"
                to={`/projects/${t.project_id}/tasks`}
              >
                <span className={`task-check ${t.status}`} />
                <div>
                  <strong>{t.title}</strong>
                  <small>
                    {projects.find((p) => p.id === t.project_id)?.title}
                  </small>
                  <small>
                    <CalendarDays size={12} />
                    {date(t.due_date)}
                  </small>
                </div>
              </Link>
            ))
          )}
          <div className="task-footer">Маленькие шаги. Большие результаты.</div>
        </aside>
      </div>
    </>
  );
}
export function Projects() {
  const navigate = useNavigate(),
    [copying, setCopying] = useState(false);
  const q = useQuery({
      queryKey: ["projects"],
      queryFn: ({ signal }) => read(signal).list<Project>("projects"),
    }),
    experiments = useQuery({
      queryKey: ["all-experiments"],
      queryFn: ({ signal }) => read(signal).list<Experiment>("experiments"),
    }),
    members = useQuery({
      queryKey: ["all-members"],
      queryFn: ({ signal }) => read(signal).list<Member>("project_members"),
    }),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [category, setCategory] = useState(""),
    [sort, setSort] = useState("updated"),
    [view, setView] = useState("grid"),
    [menu, setMenu] = useState<Project | null>(null),
    [deleting, setDeleting] = useState(false),
    client = useQueryClient(),
    { session } = useAuth();
  const debouncedSearch = useDebouncedValue(search);
  const projects = (q.data ?? [])
    .filter(
      (p) =>
        p.title.toLowerCase().includes(debouncedSearch.toLowerCase()) &&
        (!status || p.status === status) &&
        (!category || p.science_category === category),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : b.updated_at.localeCompare(a.updated_at),
    );
  return (
    <>
      <PageHeader
        title="Мои проекты"
        description={`${q.data?.length ?? 0} исследований в вашем пространстве`}
        action={
          <Button asChild variant="primary">
            <Link to="/projects/new">
              <Plus size={18} />
              Новый проект
            </Link>
          </Button>
        }
      />
      <div className="toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Поиск по названию"
            placeholder="Найти исследование…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Статус"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Все статусы</option>
          {Object.entries(statuses)
            .slice(0, 4)
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </select>
        <select
          aria-label="Научная область"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Все области</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Сортировка"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="updated">По обновлению</option>
          <option value="title">По названию</option>
        </select>
        <div className="segmented">
          <Button
            aria-label="Сетка"
            aria-pressed={view === "grid"}
            variant={view === "grid" ? "secondary" : "ghost"}
            onClick={() => setView("grid")}
          >
            <Grid2X2 size={17} />
          </Button>
          <Button
            aria-label="Список"
            aria-pressed={view === "list"}
            variant={view === "list" ? "secondary" : "ghost"}
            onClick={() => setView("list")}
          >
            <List size={17} />
          </Button>
        </div>
      </div>
      {q.isLoading ? (
        <Skeleton />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : projects.length ? (
        <div className={`project-grid ${view === "list" ? "list-view" : ""}`}>
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              experiments={experiments.data}
              members={members.data}
              onMenu={() => setMenu(menu?.id === p.id ? null : p)}
            />
          ))}
        </div>
      ) : (
        <Empty
          title={
            q.data?.length
              ? "Ничего не найдено"
              : "Ваше первое исследование начинается здесь"
          }
          text="Создайте проект или измените условия поиска."
        />
      )}
      {menu && (
        <div className="card action-panel">
          <h3>{menu.title}</h3>
          <Button asChild>
            <Link to={`/projects/${menu.id}`}>Открыть</Link>
          </Button>
          <Button onClick={() => setMenu(null)}>Закрыть</Button>
          {(menu.owner_id === session?.user.id ||
            members.data?.some(
              (m) =>
                m.project_id === menu.id &&
                m.user_id === session?.user.id &&
                m.role === "editor",
            )) && (
            <Button asChild>
              <Link to={`/projects/${menu.id}?edit=1`}>Редактировать</Link>
            </Button>
          )}
          <Button
            disabled={copying}
            onClick={async () => {
              setCopying(true);
              try {
                const id = await rpc<string>("duplicate_project", {
                  source_id: menu.id,
                });
                await client.invalidateQueries({ queryKey: ["projects"] });
                toast.success(
                  "Создана копия разделов, экспериментов и задач. Файлы и команда не копируются.",
                );
                navigate(`/projects/${id}`);
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setCopying(false);
              }
            }}
          >
            {copying ? "Копирование…" : "Дублировать данные"}
          </Button>
          {menu.owner_id === session?.user.id && (
            <>
              <Button
                onClick={async () => {
                  try {
                    await update(
                      "projects",
                      menu.id,
                      { status: "archived" },
                      menu.version,
                    );
                    await client.invalidateQueries({ queryKey: ["projects"] });
                    setMenu(null);
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }}
              >
                В архив
              </Button>
              <Button variant="danger" onClick={() => setDeleting(true)}>
                Удалить
              </Button>
            </>
          )}
        </div>
      )}
      <Confirm
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Удалить исследование?"
        text="Удалятся проект, эксперименты и результаты. Сначала удалите файлы проекта из хранилища."
        onConfirm={async () => {
          await remove("projects", menu!.id);
          await client.invalidateQueries({ queryKey: ["projects"] });
          setMenu(null);
        }}
      />
    </>
  );
}
export function NewProject() {
  const navigate = useNavigate(),
    client = useQueryClient(),
    [error, setError] = useState(""),
    form = useForm<z.infer<typeof projectSchema>>({
      resolver: zodResolver(projectSchema),
      defaultValues: {
        title: "",
        description: "",
        science_category: "Физика",
        hypothesis: "",
        objectives: "",
        methodology: "",
        expected_results: "",
        conclusions: "",
        status: "active",
        start_date: new Date().toISOString().slice(0, 10),
        due_date: "",
      },
    });
  return (
    <>
      <PageHeader
        eyebrow="НОВОЕ ИССЛЕДОВАНИЕ"
        title="От идеи к открытию"
        description="Сформулируйте вопрос, который вам хочется исследовать."
      />
      <form
        className="card project-form"
        onSubmit={form.handleSubmit(async (v) => {
          setError("");
          try {
            const p = await insert<Project>("projects", {
              ...v,
              due_date: v.due_date || null,
              start_date: v.start_date || null,
            });
            await client.invalidateQueries({ queryKey: ["projects"] });
            toast.success("Проект создан");
            navigate(`/projects/${p.id}`);
          } catch (e) {
            setError(errorMessage(e));
          }
        })}
      >
        <div className="section-heading">
          <h2>Основная информация</h2>
          <Badge tone="blue">Новый проект</Badge>
        </div>
        <label className="field">
          <span>Название исследования *</span>
          <input
            {...form.register("title")}
            placeholder="Какой вопрос вы хотите исследовать?"
            maxLength={200}
          />
          {form.formState.errors.title && (
            <small className="inline-error">
              {form.formState.errors.title.message}
            </small>
          )}
        </label>
        <div className="form-grid">
          <label className="field">
            <span>Научная область</span>
            <select {...form.register("science_category")}>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Статус</span>
            <select {...form.register("status")}>
              {Object.entries(statuses)
                .slice(0, 4)
                .map(([k, v]) => (
                  <option value={k} key={k}>
                    {v}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {Object.entries(sectionLabels)
          .filter(([k]) => k !== "conclusions")
          .map(([k, v]) => (
            <label className="field" key={k}>
              <span>{v}</span>
              <textarea
                rows={k === "description" ? 3 : 4}
                {...form.register(k as keyof z.infer<typeof projectSchema>)}
                maxLength={k === "description" ? 10000 : 30000}
              />
            </label>
          ))}
        <div className="form-grid">
          <label className="field">
            <span>Дата начала</span>
            <input type="date" {...form.register("start_date")} />
          </label>
          <label className="field">
            <span>Планируемое завершение</span>
            <input type="date" {...form.register("due_date")} />
            {form.formState.errors.due_date && (
              <small className="inline-error">
                {form.formState.errors.due_date.message}
              </small>
            )}
          </label>
        </div>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button asChild type="button">
            <Link to="/projects">Отмена</Link>
          </Button>
          <Button variant="primary" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Создание…" : "Создать проект"}
          </Button>
        </div>
      </form>
    </>
  );
}
