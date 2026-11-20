import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  GraduationCap,
  CalendarDays,
  UsersRound,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../hooks/useAuth";
import { list, one, insert, rpc, update, errorMessage } from "../../lib/api";
import { categories, date } from "../../lib/validation";
import type { Application, Opportunity, Profile } from "../../types";
import {
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
const fields: FieldSpec[] = [
  { name: "title", label: "Название", required: true },
  {
    name: "subject",
    label: "Предмет",
    type: "select",
    options: categories.map((c) => ({ value: c, label: c })),
  },
  {
    name: "description",
    label: "Описание",
    type: "textarea",
    required: true,
    maxLength: 10000,
  },
  {
    name: "requirements",
    label: "Требования и дополнительная информация",
    type: "textarea",
    maxLength: 10000,
  },
  {
    name: "deadline",
    label: "Срок подачи заявки",
    type: "date",
    required: true,
  },
  {
    name: "capacity",
    label: "Количество мест (пусто — без ограничения)",
    type: "number",
    min: 1,
  },
  {
    name: "status",
    label: "Статус набора",
    type: "select",
    options: [
      { value: "open", label: "Открыт" },
      { value: "closed", label: "Закрыт" },
    ],
  },
];
export function Opportunities() {
  const { role } = useAuth(),
    [create, setCreate] = useState(false),
    [search, setSearch] = useState(""),
    [subject, setSubject] = useState(""),
    q = useQuery({
      queryKey: ["opportunities"],
      queryFn: () => list<Opportunity>("opportunities"),
    }),
    client = useQueryClient();
  const items =
    q.data?.filter(
      (o) =>
        (o.title + " " + o.description)
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (!subject || o.subject === subject),
    ) ?? [];
  return (
    <>
      <PageHeader
        title="Исследовательские возможности"
        description="Найдите тему, наставника или следующий научный вызов."
        action={
          ["teacher", "administrator"].includes(role) && (
            <Button variant="primary" onClick={() => setCreate(true)}>
              <Plus size={17} />
              Создать возможность
            </Button>
          )
        }
      />
      <div className="opportunities-banner">
        <GraduationCap size={45} />
        <div>
          <span className="eyebrow">СЛЕДУЮЩИЙ ШАГ В НАУКУ</span>
          <h2>Ваше любопытство найдёт команду.</h2>
          <p>Темы и предложения от преподавателей школьного сообщества.</p>
        </div>
      </div>
      <div className="toolbar">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск темы…"
          aria-label="Поиск возможностей"
        />
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          aria-label="Предмет"
        >
          <option value="">Все предметы</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      {q.isLoading ? (
        <Skeleton />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : !items.length ? (
        <Empty
          title="Новые возможности скоро появятся"
          text="Преподаватели смогут разместить здесь темы исследований и предложения для команд."
        />
      ) : (
        <div className="project-grid">
          {items.map((o) => (
            <Link className="card opportunity-card" key={o.id} to={o.id}>
              <div>
                <Badge tone="purple">{o.subject}</Badge>
                <Badge
                  tone={
                    o.status === "open" &&
                    o.deadline >= new Date().toISOString().slice(0, 10)
                      ? "green"
                      : "neutral"
                  }
                >
                  {o.status === "open" &&
                  o.deadline >= new Date().toISOString().slice(0, 10)
                    ? "Набор открыт"
                    : "Набор завершён"}
                </Badge>
              </div>
              <h2>{o.title}</h2>
              <p>{o.description}</p>
              <div className="opportunity-meta">
                <span>
                  <CalendarDays size={15} />
                  До {date(o.deadline)}
                </span>
                <span>
                  <UsersRound size={15} />
                  {o.capacity ?? "Без ограничения"} мест
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
      <Modal
        open={create}
        onOpenChange={setCreate}
        title="Новая исследовательская возможность"
      >
        <DataForm
          fields={fields}
          initial={{
            title: "",
            subject: "Физика",
            description: "",
            requirements: "",
            deadline: "",
            capacity: "",
            status: "open",
          }}
          submit="Опубликовать возможность"
          onSave={async (v) => {
            await insert("opportunities", {
              ...v,
              capacity: v.capacity ? Number(v.capacity) : null,
            });
            await client.invalidateQueries({ queryKey: ["opportunities"] });
            setCreate(false);
            toast.success("Возможность опубликована");
          }}
        />
      </Modal>
    </>
  );
}
export function OpportunityDetail() {
  const { id = "" } = useParams(),
    { session, role } = useAuth(),
    [apply, setApply] = useState(false),
    [editing, setEditing] = useState(false),
    [editVersion, setEditVersion] = useState(0),
    [busy, setBusy] = useState(""),
    client = useQueryClient(),
    q = useQuery({
      queryKey: ["opportunity", id],
      queryFn: () => one<Opportunity>("opportunities", id),
    }),
    apps = useQuery({
      queryKey: ["applications", id],
      queryFn: () =>
        list<Application>("opportunity_applications", { opportunity_id: id }),
    }),
    teacher = useQuery({
      queryKey: ["teacher", q.data?.teacher_id],
      queryFn: () => one<Profile>("profiles", q.data!.teacher_id),
      enabled: !!q.data,
    }),
    students = useQuery({
      queryKey: ["applicants", id, apps.data?.length],
      queryFn: () =>
        Promise.all(
          (apps.data ?? []).map((a) => one<Profile>("profiles", a.student_id)),
        ),
      enabled: !!apps.data && q.data?.teacher_id === session?.user.id,
    });
  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const o = q.data,
    owner = o.teacher_id === session?.user.id,
    myApplication = apps.data?.find((a) => a.student_id === session?.user.id);
  return (
    <>
      <Link className="back-link" to="/opportunities">
        Исследовательские возможности
      </Link>
      <PageHeader
        title={o.title}
        description={`${o.subject} · ${teacher.data?.display_name || "Преподаватель"}`}
        action={
          owner ? (
            <Button
              onClick={() => {
                setEditVersion(o.version);
                setEditing(true);
              }}
            >
              Редактировать
            </Button>
          ) : role === "student" &&
            !myApplication &&
            o.status === "open" &&
            o.deadline >= new Date().toISOString().slice(0, 10) ? (
            <Button variant="primary" onClick={() => setApply(true)}>
              <Send size={16} />
              Подать заявку
            </Button>
          ) : myApplication ? (
            <Badge tone="blue">
              {
                {
                  submitted: "Заявка отправлена",
                  accepted: "Вы приняты",
                  rejected: "Заявка отклонена",
                }[myApplication.status]
              }
            </Badge>
          ) : null
        }
      />
      <div className="card opportunity-detail">
        <h2>О возможности</h2>
        <p>{o.description}</p>
        <h2>Требования</h2>
        <p>{o.requirements || "Специальные требования не указаны."}</p>
        <div className="opportunity-meta">
          <span>
            <CalendarDays size={16} />
            До {date(o.deadline)}
          </span>
          <span>
            <UsersRound size={16} />
            {o.capacity ?? "Без ограничения"} мест
          </span>
        </div>
      </div>
      {owner && (
        <section className="card applications">
          <h2>Заявки участников</h2>
          {!apps.data?.length ? (
            <Empty title="Пока нет заявок" />
          ) : (
            apps.data.map((a) => (
              <article className="application" key={a.id}>
                <div>
                  <strong>
                    {students.data?.find((s) => s.id === a.student_id)
                      ?.display_name || "Ученик"}
                  </strong>
                  <Badge>
                    {
                      {
                        submitted: "На рассмотрении",
                        accepted: "Принят",
                        rejected: "Отклонён",
                      }[a.status]
                    }
                  </Badge>
                </div>
                <p>{a.message}</p>
                <small>{date(a.created_at)}</small>
                <div className="row-actions">
                  {["accepted", "rejected"].map((decision) => (
                    <Button
                      key={decision}
                      disabled={busy === a.id || a.status === decision}
                      onClick={async () => {
                        setBusy(a.id);
                        try {
                          await rpc("review_application", {
                            aid: a.id,
                            decision,
                          });
                          await client.invalidateQueries({
                            queryKey: ["applications", id],
                          });
                          toast.success("Решение сохранено");
                        } catch (e) {
                          toast.error(errorMessage(e));
                        } finally {
                          setBusy("");
                        }
                      }}
                    >
                      {decision === "accepted" ? "Принять" : "Отклонить"}
                    </Button>
                  ))}
                </div>
              </article>
            ))
          )}
        </section>
      )}
      <Modal
        open={apply}
        onOpenChange={setApply}
        title="Заявка на исследование"
      >
        <DataForm
          fields={[
            {
              name: "message",
              label: "Расскажите о вашем интересе к теме",
              type: "textarea",
              required: true,
              maxLength: 5000,
            },
          ]}
          submit="Отправить заявку"
          onSave={async (v) => {
            await insert("opportunity_applications", {
              opportunity_id: id,
              message: v.message,
            });
            await client.invalidateQueries({ queryKey: ["applications", id] });
            setApply(false);
            toast.success("Заявка отправлена");
          }}
        />
      </Modal>
      <Modal
        open={editing}
        onOpenChange={setEditing}
        title="Редактировать возможность"
      >
        <DataForm
          fields={fields}
          initial={{
            title: o.title,
            subject: o.subject,
            description: o.description,
            requirements: o.requirements,
            deadline: o.deadline,
            capacity: String(o.capacity ?? ""),
            status: o.status,
          }}
          onSave={async (v) => {
            await update(
              "opportunities",
              id,
              { ...v, capacity: v.capacity ? Number(v.capacity) : null },
              editVersion,
            );
            await client.invalidateQueries({ queryKey: ["opportunity", id] });
            await client.invalidateQueries({ queryKey: ["opportunities"] });
            setEditing(false);
          }}
        />
      </Modal>
    </>
  );
}
