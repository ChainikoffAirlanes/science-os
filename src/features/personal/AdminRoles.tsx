import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { rpc } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";
import {
  Button,
  Confirm,
  Empty,
  ErrorState,
  Skeleton,
} from "../../components/ui";
type UserRole = {
  user_id: string;
  display_name: string;
  email: string;
  role: string;
};
const roles: Record<string, string> = {
  student: "Ученик",
  teacher: "Преподаватель",
  administrator: "Администратор",
};
export default function AdminRoles() {
  const [input, setInput] = useState(""),
    [search, setSearch] = useState(""),
    [pending, setPending] = useState<{ user: UserRole; role: string } | null>(
      null,
    ),
    client = useQueryClient(),
    { refresh } = useAuth();
  const q = useQuery({
    queryKey: ["admin-users", search],
    queryFn: () => rpc<UserRole[]>("admin_search_users", { search }),
    enabled: search.length >= 2,
  });
  return (
    <section className="card">
      <h2>Системные роли</h2>
      <p className="muted">
        Найдите зарегистрированного пользователя по имени или email. Назначайте
        преподавателей после проверки их личности.
      </p>
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(input.trim());
        }}
      >
        <input
          aria-label="Имя или email пользователя"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          minLength={2}
          required
          placeholder="Имя или email"
        />
        <Button type="submit">Найти пользователя</Button>
      </form>
      {q.isFetching ? (
        <Skeleton />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : search && !q.data?.length ? (
        <Empty title="Пользователь не найден" />
      ) : (
        q.data?.map((user) => (
          <div className="role-user" key={user.user_id}>
            <div>
              <strong>{user.display_name}</strong>
              <small>{user.email}</small>
            </div>
            <select
              aria-label={`Роль: ${user.display_name}`}
              value={user.role}
              onChange={(e) => setPending({ user, role: e.target.value })}
            >
              {Object.entries(roles).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        ))
      )}
      <Confirm
        open={!!pending}
        onClose={() => setPending(null)}
        title="Изменить системную роль?"
        text={
          pending
            ? `${pending.user.display_name} (${pending.user.email}): ${roles[pending.user.role]} → ${roles[pending.role]}.`
            : ""
        }
        onConfirm={async () => {
          if (!pending) return;
          await rpc("grant_user_role", {
            target_id: pending.user.user_id,
            new_role: pending.role,
          });
          await client.invalidateQueries({ queryKey: ["admin-users"] });
          refresh();
          toast.success("Роль назначена");
        }}
      />
    </section>
  );
}
