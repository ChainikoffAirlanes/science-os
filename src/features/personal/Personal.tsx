import { read } from "../../lib/api";
import AdminRoles from "./AdminRoles";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CheckCheck,
  LogOut,
  Moon,
  Sun,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "../../lib/supabase";
import { rpc, errorMessage } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";
import { date } from "../../lib/validation";
import {
  Avatar,
  Badge,
  Button,
  DataForm,
  Empty,
  ErrorState,
  PageHeader,
  Skeleton,
} from "../../components/ui";
import type { Notification } from "../../types";
export function Notifications() {
  const { session } = useAuth(),
    q = useQuery({
      queryKey: ["notifications", session?.user.id],
      queryFn: ({ signal }) =>
        read(signal).list<Notification>("notifications", {
          recipient_id: session!.user.id,
        }),
    }),
    client = useQueryClient(),
    [busy, setBusy] = useState(false);
  async function mark(id?: string) {
    setBusy(true);
    try {
      let query = db()
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_id", session!.user.id);
      query = id ? query.eq("id", id) : query.is("read_at", null);
      const { error } = await query;
      if (error) throw error;
      await client.invalidateQueries({ queryKey: ["notifications"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Уведомления"
        description="Важные события ваших исследований и команды."
        action={
          <Button
            disabled={busy || !q.data?.some((n) => !n.read_at)}
            onClick={() => void mark()}
          >
            <CheckCheck size={17} />
            Прочитать все
          </Button>
        }
      />
      {q.isLoading ? (
        <Skeleton />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : !q.data?.length ? (
        <div className="card">
          <Empty
            title="Вы ничего не пропустили"
            text="Здесь будут задачи, заявки и другие события ваших проектов."
          />
        </div>
      ) : (
        <div className="notification-list">
          {q.data.map((n) => (
            <article
              className={`card notification ${!n.read_at ? "unread" : ""}`}
              key={n.id}
            >
              <span className="notification-icon">
                <Bell size={20} />
              </span>
              <div>
                <Link to={n.target_url}>
                  <h3>{n.title}</h3>
                  <p>{n.body}</p>
                </Link>
                <small>{date(n.created_at)}</small>
              </div>
              {!n.read_at && (
                <Button
                  disabled={busy}
                  aria-label="Отметить прочитанным"
                  onClick={() => void mark(n.id)}
                >
                  <CheckCheck size={17} />
                </Button>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
export function Profile() {
  const { profile, role, refresh } = useAuth();
  const [uploading, setUploading] = useState(false);
  if (!profile) return <Skeleton />;
  return (
    <>
      <PageHeader
        title="Мой профиль"
        description="Как вас видят участники исследовательского сообщества."
      />
      <section className="card profile-card">
        <div className="profile-summary">
          <Avatar
            name={profile.display_name}
            path={profile.avatar_path}
            size={72}
          />
          <div>
            <h2>{profile.display_name || "Исследователь"}</h2>
            <Badge tone="blue">
              {
                {
                  student: "Ученик",
                  teacher: "Преподаватель",
                  administrator: "Администратор",
                }[role]
              }
            </Badge>
          </div>
        </div>
        <label className="button secondary">
          {uploading ? "Загрузка…" : "Изменить аватар"}
          <input
            type="file"
            accept="image/png,image/jpeg"
            hidden
            disabled={uploading}
            aria-label="Изменить аватар"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              try {
                if (
                  !["image/png", "image/jpeg"].includes(file.type) ||
                  !file.size ||
                  file.size > 1048576
                )
                  throw new Error("Аватар: PNG или JPEG, до 1 МБ");
                const path = `${profile.id}/${crypto.randomUUID()}`,
                  bucket = db().storage.from("science-profile-avatars");
                const uploaded = await bucket.upload(path, file, {
                  contentType: file.type,
                });
                if (uploaded.error) throw uploaded.error;
                const saved = await db()
                  .from("profiles")
                  .update({ avatar_path: path })
                  .eq("id", profile.id);
                if (saved.error) {
                  await bucket.remove([path]);
                  throw saved.error;
                }
                if (profile.avatar_path)
                  await bucket.remove([profile.avatar_path]);
                refresh();
                toast.success("Аватар обновлён");
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
        <DataForm
          initial={{
            first_name: profile.first_name,
            last_name: profile.last_name,
            display_name: profile.display_name,
            bio: profile.bio,
          }}
          fields={[
            {
              name: "first_name",
              label: "Имя",
              required: true,
              maxLength: 100,
            },
            {
              name: "last_name",
              label: "Фамилия",
              required: true,
              maxLength: 100,
            },
            { name: "display_name", label: "Отображаемое имя", required: true },
            { name: "bio", label: "О себе", type: "textarea", maxLength: 2000 },
          ]}
          onSave={async (v) => {
            const { error } = await db()
              .from("profiles")
              .update({ ...v, updated_at: new Date().toISOString() })
              .eq("id", profile.id);
            if (error) throw error;
            refresh();
            toast.success("Профиль сохранён");
          }}
        />
        <p className="muted">
          Системная роль назначается администратором и не изменяется через
          профиль.
        </p>
      </section>
    </>
  );
}
export function Settings() {
  const { session, profile, role, refresh } = useAuth(),
    navigate = useNavigate(),
    [theme, setTheme] = useState(
      document.documentElement.dataset.theme ?? "light",
    );
  function changeTheme(value: string) {
    setTheme(value);
    document.documentElement.dataset.theme = value;
    localStorage.setItem("science-theme", value);
  }
  return (
    <>
      <PageHeader
        title="Настройки"
        description="Ваш аккаунт, оформление и безопасность."
      />
      <div className="settings-grid">
        <section className="card">
          <h2>Оформление</h2>
          <p className="muted">Выберите тему рабочего пространства.</p>
          <div className="theme-options">
            <Button
              aria-pressed={theme === "light"}
              onClick={() => changeTheme("light")}
            >
              <Sun />
              Светлая
            </Button>
            <Button
              aria-pressed={theme === "dark"}
              onClick={() => changeTheme("dark")}
            >
              <Moon />
              Тёмная
            </Button>
          </div>
        </section>
        <section className="card">
          <h2>Аккаунт</h2>
          <p>{session?.user.email}</p>
          <p className="muted">
            <ShieldCheck size={16} /> Приватные данные защищены правами проекта.
          </p>
          <Button
            onClick={async () => {
              await db().auth.signOut();
              navigate("/login");
            }}
          >
            <LogOut size={17} />
            Выйти из аккаунта
          </Button>
        </section>
        <section className="card">
          <h2>Безопасность</h2>
          <DataForm
            fields={[
              {
                name: "password",
                label: "Новый пароль (минимум 10 символов)",
                type: "password",
                required: true,
                maxLength: 128,
              },
              {
                name: "confirm",
                label: "Повтор пароля",
                type: "password",
                required: true,
                maxLength: 128,
              },
            ]}
            submit="Изменить пароль"
            onSave={async (v) => {
              if (v.password.length < 10 || v.password !== v.confirm)
                throw new Error(
                  "Пароли должны совпадать и содержать минимум 10 символов",
                );
              const { error } = await db().auth.updateUser({
                password: v.password,
              });
              if (error) throw error;
              toast.success("Пароль изменён");
            }}
          />
        </section>
        <section className="card">
          <h2>Уведомления</h2>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={profile?.notifications_enabled ?? true}
              onChange={async (e) => {
                if (!profile) return;
                const { error } = await db()
                  .from("profiles")
                  .update({ notifications_enabled: e.target.checked })
                  .eq("id", profile.id);
                if (error) toast.error("Не удалось сохранить настройку");
                else refresh();
              }}
            />
            Получать уведомления о задачах и заявках
          </label>
        </section>
        {role === "administrator" && <AdminRoles />}
      </div>
    </>
  );
}
export function InvitePage() {
  const { token = "" } = useParams(),
    { session } = useAuth(),
    navigate = useNavigate(),
    client = useQueryClient(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!session)
    sessionStorage.setItem("invite-after-login", `/invite/${token}`);
  return (
    <div className="invite-page card">
      <UsersRound size={40} />
      <h1>Наука лучше вместе</h1>
      <p>Вас пригласили в исследовательскую команду Science OS.</p>
      {session ? (
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const id = await rpc<string>("accept_invite", { token });
              await client.invalidateQueries({ queryKey: ["projects"] });
              sessionStorage.removeItem("invite-after-login");
              navigate(`/projects/${id}`);
            } catch {
              setError(
                "Приглашение недействительно, отозвано или срок его действия истёк. Попросите владельца создать новую ссылку.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Присоединение…" : "Принять приглашение"}
        </Button>
      ) : (
        <Button asChild variant="primary">
          <Link to="/login">Войти и принять приглашение</Link>
        </Button>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
