import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Plus } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "../projects/Workspace";
import { list, one, insert, remove, update } from "../../lib/api";
import { db } from "../../lib/supabase";
import { canEdit, date } from "../../lib/validation";
import type { Experiment, Member, Profile } from "../../types";
import {
  Avatar,
  Button,
  Confirm,
  DataForm,
  Empty,
  ErrorState,
  Modal,
  PageHeader,
  Skeleton,
} from "../../components/ui";
export function Experiments() {
  const { project: p, role, online } = useWorkspace(),
    [create, setCreate] = useState(false),
    [editing, setEditing] = useState<Experiment | null>(null),
    [deleting, setDeleting] = useState<Experiment | null>(null),
    navigate = useNavigate(),
    client = useQueryClient();
  const q = useQuery({
      queryKey: ["experiments", p.id],
      queryFn: () => list<Experiment>("experiments", { project_id: p.id }),
    }),
    members = useQuery({
      queryKey: ["members", p.id],
      queryFn: () => list<Member>("project_members", { project_id: p.id }),
    }),
    profiles = useQuery({
      queryKey: ["team-profiles", p.id, members.data?.length],
      queryFn: () =>
        Promise.all(
          [p.owner_id, ...(members.data ?? []).map((m) => m.user_id)].map(
            (id) => one<Profile>("profiles", id),
          ),
        ),
      enabled: !!members.data,
    });
  return (
    <>
      <PageHeader
        title="Эксперименты"
        description="Наблюдения, измерения и воспроизводимые результаты."
        action={
          canEdit(role) && (
            <Button variant="primary" onClick={() => setCreate(true)}>
              <Plus size={18} />
              Новый эксперимент
            </Button>
          )
        }
      />
      {online.length > 0 && (
        <div className="presence-row">
          {online.map((u) => (
            <Avatar key={u.id} name={u.name} size={26} />
          ))}
          <span>В пространстве сейчас: {online.length}</span>
        </div>
      )}
      {q.isLoading ? (
        <Skeleton />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : q.data?.length ? (
        <div className="project-grid">
          {q.data.map((e) => (
            <ExperimentCard
              key={e.id}
              experiment={e}
              responsible={
                profiles.data?.find((p) => p.id === e.responsible_user_id)
                  ?.display_name
              }
              editable={canEdit(role)}
              onEdit={() => setEditing(e)}
              onDelete={() => setDeleting(e)}
            />
          ))}
        </div>
      ) : (
        <Empty
          title="От гипотезы к данным"
          text="Создайте эксперимент, добавьте параметры и начните наблюдения."
          action={
            canEdit(role) && (
              <Button onClick={() => setCreate(true)}>
                <Plus size={17} />
                Новый эксперимент
              </Button>
            )
          }
        />
      )}
      <Modal
        open={create || !!editing}
        onOpenChange={(v) => {
          if (!v) {
            setCreate(false);
            setEditing(null);
          }
        }}
        title={editing ? "Редактировать эксперимент" : "Новый эксперимент"}
      >
        <DataForm
          key={editing?.id ?? "new"}
          initial={
            editing
              ? {
                  title: editing.title,
                  description: editing.description,
                  methodology: editing.methodology,
                  experiment_date: editing.experiment_date ?? "",
                  responsible_user_id: editing.responsible_user_id ?? "",
                }
              : {
                  title: "",
                  description: "",
                  methodology: "",
                  experiment_date: new Date().toISOString().slice(0, 10),
                  responsible_user_id: "",
                }
          }
          fields={[
            { name: "title", label: "Название", required: true },
            {
              name: "description",
              label: "Описание",
              type: "textarea",
              maxLength: 10000,
            },
            {
              name: "methodology",
              label: "Метод проведения",
              type: "textarea",
            },
            { name: "experiment_date", label: "Дата", type: "date" },
            {
              name: "responsible_user_id",
              label: "Ответственный",
              type: "select",
              options: [
                { value: "", label: "Не назначен" },
                ...(profiles.data ?? []).map((p) => ({
                  value: p.id,
                  label: p.display_name || "Исследователь",
                })),
              ],
            },
          ]}
          submit={editing ? "Сохранить" : "Создать эксперимент"}
          onSave={async (v) => {
            const patch = {
              ...v,
              experiment_date: v.experiment_date || null,
              responsible_user_id: v.responsible_user_id || null,
            };
            const saved = editing
              ? await update<Experiment>(
                  "experiments",
                  editing.id,
                  patch,
                  editing.version,
                )
              : await insert<Experiment>("experiments", {
                  ...patch,
                  project_id: p.id,
                });
            await client.invalidateQueries({ queryKey: ["experiments", p.id] });
            const isNew = !editing;
            setCreate(false);
            setEditing(null);
            toast.success(
              isNew ? "Эксперимент создан" : "Эксперимент сохранён",
            );
            if (isNew) navigate(`/projects/${p.id}/experiments/${saved.id}`);
          }}
        />
      </Modal>
      <Confirm
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Удалить эксперимент?"
        text="Все параметры, наблюдения и значения этого эксперимента будут удалены."
        onConfirm={async () => {
          await remove("experiments", deleting!.id);
          await client.invalidateQueries({ queryKey: ["experiments", p.id] });
          toast.success("Эксперимент удалён");
        }}
      />
    </>
  );
}
function ExperimentCard({
  experiment: e,
  responsible,
  editable,
  onEdit,
  onDelete,
}: {
  experiment: Experiment;
  responsible?: string;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const counts = useQuery({
    queryKey: ["experiment-counts", e.project_id, e.id],
    queryFn: async () => {
      const [rows, parameters] = await Promise.all([
        db()
          .from("experiment_rows")
          .select("id", { count: "exact", head: true })
          .eq("experiment_id", e.id),
        db()
          .from("experiment_parameters")
          .select("id", { count: "exact", head: true })
          .eq("experiment_id", e.id),
      ]);
      if (rows.error || parameters.error) throw rows.error ?? parameters.error;
      return { rows: rows.count, parameters: parameters.count };
    },
  });
  return (
    <article className="card experiment-card">
      <span className="category-icon">
        <FlaskConical />
      </span>
      <Link to={e.id}>
        <h3>{e.title}</h3>
        <p>{e.description || "Описание пока не добавлено"}</p>
        <small>
          {counts.data?.rows ?? "—"} наблюдений ·{" "}
          {counts.data?.parameters ?? "—"} параметров
        </small>
        <small>Ответственный: {responsible || "Не назначен"}</small>
        <small>Обновлён {date(e.updated_at)}</small>
        <span className="text-link">Открыть таблицу</span>
      </Link>
      {editable && (
        <div className="row-actions" style={{ marginTop: 16 }}>
          <Button onClick={onEdit}>Редактировать</Button>
          <Button variant="ghost" onClick={onDelete}>
            Удалить
          </Button>
        </div>
      )}
    </article>
  );
}
