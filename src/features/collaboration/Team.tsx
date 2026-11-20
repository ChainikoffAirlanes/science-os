import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Copy, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "../projects/Workspace";
import { list, one, rpc, errorMessage } from "../../lib/api";
import { date } from "../../lib/validation";
import { appUrl } from "../../lib/supabase";
import type { Invite, Member, Profile } from "../../types";
import {
  Avatar,
  Badge,
  Button,
  Confirm,
  DataForm,
  Empty,
  ErrorState,
  Modal,
  PageHeader,
  Skeleton,
} from "../../components/ui";
export default function Team() {
  const { project, role, online } = useWorkspace(),
    client = useQueryClient(),
    [open, setOpen] = useState(false),
    [link, setLink] = useState(""),
    [removeMember, setRemoveMember] = useState<Member | null>(null),
    [busy, setBusy] = useState("");
  const q = useQuery({
      queryKey: ["members", project.id],
      queryFn: () =>
        list<Member>("project_members", { project_id: project.id }),
    }),
    profiles = useQuery({
      queryKey: ["team-profiles", project.id, q.data?.length],
      queryFn: async () =>
        Promise.all(
          [project.owner_id, ...(q.data ?? []).map((m) => m.user_id)].map(
            (id) => one<Profile>("profiles", id),
          ),
        ),
      enabled: !!q.data,
    }),
    invites = useQuery({
      queryKey: ["invites", project.id],
      queryFn: () =>
        list<Invite>("project_invites", { project_id: project.id }),
      enabled: role === "owner",
    });
  const members = [
    {
      id: "owner",
      user_id: project.owner_id,
      role: "owner",
      joined_at: project.created_at,
    },
    ...(q.data ?? []),
  ];
  return (
    <>
      <PageHeader
        title="Команда проекта"
        description="Совместная работа начинается с общей идеи."
        action={
          role === "owner" && (
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus size={18} />
              Пригласить участника
            </Button>
          )
        }
      />
      {q.isLoading ? (
        <Skeleton />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <div className="card table-scroll">
          <table className="standard-table">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Роль</th>
                <th>Присоединился</th>
                <th>Присутствие</th>
                {role === "owner" && <th>Действия</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const profile = profiles.data?.find((p) => p.id === m.user_id);
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="person">
                        <Avatar
                          name={profile?.display_name || "Исследователь"}
                          path={profile?.avatar_path}
                        />
                        <strong>
                          {profile?.display_name || "Исследователь"}
                        </strong>
                      </div>
                    </td>
                    <td>
                      <Badge tone={m.role === "owner" ? "blue" : "neutral"}>
                        {
                          {
                            owner: "Владелец",
                            editor: "Редактор",
                            viewer: "Наблюдатель",
                          }[m.role]
                        }
                      </Badge>
                    </td>
                    <td>{date(m.joined_at)}</td>
                    <td>
                      {online.some((u) => u.id === m.user_id) ? (
                        <span className="online-label">В сети</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    {role === "owner" && (
                      <td>
                        {m.role !== "owner" ? (
                          <div className="row-actions">
                            <select
                              aria-label="Роль участника"
                              value={m.role}
                              disabled={busy === m.id}
                              onChange={async (e) => {
                                setBusy(m.id);
                                try {
                                  await rpc("change_member", {
                                    mid: m.id,
                                    new_role: e.target.value,
                                  });
                                  await client.invalidateQueries({
                                    queryKey: ["members", project.id],
                                  });
                                } catch (e) {
                                  toast.error(errorMessage(e));
                                } finally {
                                  setBusy("");
                                }
                              }}
                            >
                              <option value="editor">Редактор</option>
                              <option value="viewer">Наблюдатель</option>
                            </select>
                            <Button
                              variant="ghost"
                              onClick={() => setRemoveMember(m as Member)}
                            >
                              Исключить
                            </Button>
                          </div>
                        ) : (
                          <small>Постоянный владелец</small>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {role === "owner" && (
        <section className="card invites-card">
          <h2>Приглашения</h2>
          <p className="muted">
            Ссылки действуют 7 дней. Секретный токен показывается только при
            создании.
          </p>
          {!invites.data?.length ? (
            <Empty
              title="Нет действующих приглашений"
              text="Создайте ссылку и отправьте её будущему участнику."
            />
          ) : (
            invites.data.map((i) => (
              <div className="invite-row" key={i.id}>
                <UsersRound size={18} />
                <div>
                  <strong>
                    {i.assigned_role === "editor" ? "Редактор" : "Наблюдатель"}
                  </strong>
                  <small>
                    До {date(i.expires_at)} · {i.use_count} / {i.max_uses}{" "}
                    использований
                  </small>
                </div>
                {i.revoked_at || new Date(i.expires_at) < new Date() ? (
                  <Badge>Недействительно</Badge>
                ) : (
                  <Button
                    disabled={busy === i.id}
                    onClick={async () => {
                      setBusy(i.id);
                      try {
                        await rpc("revoke_invite", { iid: i.id });
                        await client.invalidateQueries({
                          queryKey: ["invites", project.id],
                        });
                      } catch (e) {
                        toast.error(errorMessage(e));
                      } finally {
                        setBusy("");
                      }
                    }}
                  >
                    Отозвать
                  </Button>
                )}
              </div>
            ))
          )}
        </section>
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Пригласить в исследование"
        description="Редактор может менять данные; наблюдатель получает только чтение."
      >
        <DataForm
          initial={{ assigned_role: "editor", max_uses: "1" }}
          fields={[
            {
              name: "assigned_role",
              label: "Роль",
              type: "select",
              options: [
                { value: "editor", label: "Редактор" },
                { value: "viewer", label: "Наблюдатель" },
              ],
            },
            {
              name: "max_uses",
              label: "Максимум участников по ссылке",
              type: "number",
              min: 1,
              required: true,
            },
          ]}
          submit="Создать ссылку"
          onSave={async (v) => {
            const result = await rpc<{ token: string }>("create_invite", {
              pid: project.id,
              assigned_role: v.assigned_role,
              max_uses: Number(v.max_uses),
            });
            setLink(appUrl(`/invite/${result.token}`));
            await client.invalidateQueries({
              queryKey: ["invites", project.id],
            });
          }}
        />
        {link && (
          <div className="generated-link">
            <label className="field">
              <span>Ссылка готова</span>
              <input readOnly value={link} />
            </label>
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                toast.success("Приглашение скопировано");
              }}
            >
              <Copy size={16} />
              Копировать
            </Button>
          </div>
        )}
      </Modal>
      <Confirm
        open={!!removeMember}
        onClose={() => setRemoveMember(null)}
        title="Исключить участника?"
        text="Он потеряет доступ к приватным данным и файлам исследования."
        onConfirm={async () => {
          await rpc("change_member", { mid: removeMember!.id, new_role: null });
          await client.invalidateQueries({ queryKey: ["members", project.id] });
        }}
      />
    </>
  );
}
