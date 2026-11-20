import { read } from "../../lib/api";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  CalendarDays,
  MessageSquare,
  Columns3,
  List,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "../projects/Workspace";
import { insert, update, errorMessage, ConflictError } from "../../lib/api";
import { canEdit, date, statuses } from "../../lib/validation";
import type { Activity, Comment, Member, Profile, Task } from "../../types";
import {
  Avatar,
  Badge,
  Button,
  DataForm,
  Empty,
  ErrorState,
  Modal,
  PageHeader,
  Skeleton,
} from "../../components/ui";
import type { FieldSpec } from "../../components/ui";
export default function Tasks() {
  const { project, role } = useWorkspace(),
    [creating, setCreating] = useState(false),
    [active, setActive] = useState<Task | null>(null),
    [view, setView] = useState("board"),
    client = useQueryClient();
  const q = useQuery({
      queryKey: ["tasks", project.id],
      queryFn: ({ signal }) =>
        read(signal).list<Task>("tasks", { project_id: project.id }),
    }),
    members = useQuery({
      queryKey: ["members", project.id],
      queryFn: ({ signal }) =>
        read(signal).list<Member>("project_members", {
          project_id: project.id,
        }),
    }),
    counts = useQuery({
      queryKey: ["comments", project.id, "counts"],
      queryFn: ({ signal }) =>
        read(signal).list<Pick<Comment, "task_id">>("task_comments", {
          project_id: project.id,
        }),
    }),
    profiles = useQuery({
      queryKey: ["team-profiles", project.id, members.data?.length],
      queryFn: async ({ signal }) =>
        Promise.all(
          [project.owner_id, ...(members.data ?? []).map((m) => m.user_id)].map(
            (id) => read(signal).one<Profile>("profiles", id),
          ),
        ),
      enabled: !!members.data,
    });
  const fields: FieldSpec[] = [
    { name: "title", label: "Название", required: true },
    {
      name: "description",
      label: "Описание",
      type: "textarea",
      maxLength: 10000,
    },
    {
      name: "assigned_to",
      label: "Исполнитель",
      type: "select",
      options: [
        { value: "", label: "Не назначен" },
        ...(profiles.data ?? []).map((p) => ({
          value: p.id,
          label: p.display_name || "Исследователь",
        })),
      ],
    },
    {
      name: "status",
      label: "Статус",
      type: "select",
      options: ["todo", "in_progress", "done"].map((value) => ({
        value,
        label: statuses[value],
      })),
    },
    {
      name: "priority",
      label: "Приоритет",
      type: "select",
      options: [
        { value: "low", label: "Низкий" },
        { value: "medium", label: "Средний" },
        { value: "high", label: "Высокий" },
      ],
    },
    { name: "due_date", label: "Дедлайн", type: "date" },
  ];
  function taskCard(t: Task) {
    const user = profiles.data?.find((p) => p.id === t.assigned_to);
    return (
      <button className="task-card" key={t.id} onClick={() => setActive(t)}>
        <Badge tone={t.priority === "high" ? "orange" : "neutral"}>
          {{ low: "Низкий", medium: "Средний", high: "Высокий" }[t.priority]}
        </Badge>
        <h3>{t.title}</h3>
        {t.description && <p>{t.description}</p>}
        <div>
          <span>
            <CalendarDays size={14} />
            {date(t.due_date)}
          </span>
          <span aria-label="Комментарии">
            <MessageSquare size={14} />
            {counts.data?.filter((c) => c.task_id === t.id).length ?? "—"}
          </span>
          {user && (
            <Avatar
              name={user.display_name}
              path={user.avatar_path}
              size={26}
            />
          )}
        </div>
      </button>
    );
  }
  return (
    <>
      <PageHeader
        title="Задачи исследования"
        description="От больших целей к понятным следующим шагам."
        action={
          canEdit(role) && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={17} />
              Создать задачу
            </Button>
          )
        }
      />
      <div className="toolbar">
        <div className="segmented">
          <Button
            variant={view === "board" ? "secondary" : "ghost"}
            onClick={() => setView("board")}
          >
            <Columns3 size={17} />
            Доска
          </Button>
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            onClick={() => setView("list")}
          >
            <List size={17} />
            Список
          </Button>
        </div>
        <span className="muted">{q.data?.length ?? 0} задач</span>
      </div>
      {q.isLoading ? (
        <Skeleton />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : view === "board" ? (
        <div className="kanban">
          {["todo", "in_progress", "done"].map((status) => (
            <section className="kanban-column" key={status}>
              <h3>
                <i className={`status-dot ${status}`} />
                {statuses[status]}
                <span>
                  {q.data?.filter((t) => t.status === status).length ?? 0}
                </span>
              </h3>
              {q.data?.filter((t) => t.status === status).map(taskCard)}
              {!q.data?.some((t) => t.status === status) && (
                <p className="muted">Здесь пока нет задач</p>
              )}
            </section>
          ))}
        </div>
      ) : (
        <div className="task-list">
          {q.data?.length ? q.data.map(taskCard) : <Empty title="Нет задач" />}
        </div>
      )}
      <Modal open={creating} onOpenChange={setCreating} title="Новая задача">
        <DataForm
          initial={{
            title: "",
            description: "",
            assigned_to: "",
            status: "todo",
            priority: "medium",
            due_date: "",
          }}
          fields={fields}
          submit="Создать задачу"
          onSave={async (v) => {
            await insert("tasks", {
              ...v,
              project_id: project.id,
              assigned_to: v.assigned_to || null,
              due_date: v.due_date || null,
            });
            await client.invalidateQueries({ queryKey: ["tasks", project.id] });
            setCreating(false);
            toast.success("Задача создана");
          }}
        />
      </Modal>
      {active && (
        <TaskDetails
          task={q.data?.find((t) => t.id === active.id) ?? active}
          fields={fields}
          editable={canEdit(role)}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}
function TaskDetails({
  task,
  fields,
  editable,
  onClose,
}: {
  task: Task;
  fields: FieldSpec[];
  editable: boolean;
  onClose: () => void;
}) {
  const client = useQueryClient(),
    [base, setBase] = useState(task),
    [conflict, setConflict] = useState<Task | null>(null),
    [formKey, setFormKey] = useState(0),
    [comment, setComment] = useState(""),
    [busy, setBusy] = useState(false);
  const comments = useQuery({
      queryKey: ["comments", task.project_id, task.id],
      queryFn: ({ signal }) =>
        read(signal).list<Comment>("task_comments", { task_id: task.id }),
    }),
    history = useQuery({
      queryKey: ["task-history", task.project_id, task.id],
      queryFn: ({ signal }) =>
        read(signal).list<Activity>("activity_log", {
          entity_id: task.id,
          project_id: task.project_id,
        }),
    });
  return (
    <Modal side open onOpenChange={(v) => !v && onClose()} title={task.title}>
      <Badge tone="blue">{statuses[task.status]}</Badge>
      {editable ? (
        <DataForm
          key={formKey}
          fields={fields}
          initial={{
            title: base.title,
            description: base.description,
            assigned_to: base.assigned_to ?? "",
            status: base.status,
            priority: base.priority,
            due_date: base.due_date ?? "",
          }}
          onSave={async (v) => {
            try {
              const saved = await update<Task>(
                "tasks",
                task.id,
                {
                  ...v,
                  assigned_to: v.assigned_to || null,
                  due_date: v.due_date || null,
                },
                base.version,
              );
              setBase(saved);
              setConflict(null);
              await client.invalidateQueries({
                queryKey: ["tasks", task.project_id],
              });
              toast.success("Задача сохранена");
            } catch (e) {
              if (e instanceof ConflictError) setConflict(e.current as Task);
              throw e;
            }
          }}
        />
      ) : (
        <p>{task.description}</p>
      )}
      {conflict && (
        <div className="conflict-panel" role="alert">
          <h3>Запись изменена другим участником</h3>
          <p>Ваш ввод сохранён в форме. Серверная версия:</p>
          <dl>
            <dt>Название</dt>
            <dd>{conflict.title}</dd>
            <dt>Описание</dt>
            <dd>{conflict.description || "Не заполнено"}</dd>
            <dt>Статус</dt>
            <dd>{statuses[conflict.status]}</dd>
            <dt>Срок</dt>
            <dd>{date(conflict.due_date)}</dd>
          </dl>
          <div className="row-actions">
            <Button
              onClick={() => {
                setBase(conflict);
                setFormKey((k) => k + 1);
                setConflict(null);
              }}
            >
              Загрузить серверные поля
            </Button>
            <Button
              onClick={() => {
                setBase(conflict);
                setConflict(null);
              }}
            >
              Продолжить со своим вводом
            </Button>
          </div>
        </div>
      )}
      <section className="comments">
        <h3>
          <MessageSquare size={17} />
          Комментарии
        </h3>
        {comments.data?.map((c) => (
          <div className="comment" key={c.id}>
            <p>{c.body}</p>
            <small>{date(c.created_at)}</small>
          </div>
        ))}
        {!comments.data?.length && (
          <p className="muted">Пока без комментариев.</p>
        )}
        {editable && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!comment.trim() || busy) return;
              setBusy(true);
              try {
                await insert("task_comments", {
                  project_id: task.project_id,
                  task_id: task.id,
                  body: comment.trim(),
                });
                setComment("");
                await client.invalidateQueries({
                  queryKey: ["comments", task.project_id],
                });
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <textarea
              aria-label="Комментарий"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              required
              maxLength={5000}
              placeholder="Добавить комментарий…"
            />
            <Button disabled={busy || !comment.trim()}>Отправить</Button>
          </form>
        )}
      </section>
      <h3>История изменений</h3>
      {history.data?.map((a) => (
        <p className="muted" key={a.id}>
          {a.action === "INSERT" ? "Создана" : "Изменена"} ·{" "}
          {date(a.created_at)}
        </p>
      ))}
    </Modal>
  );
}
