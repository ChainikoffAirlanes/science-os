import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  Atom,
  Eye,
  EyeOff,
  Check,
  ArrowUpRight,
  LockKeyhole,
  FlaskConical,
  ChartNoAxesCombined,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../hooks/useAuth";
import {
  configured,
  db,
  appUrl,
  emailDeliveryEnabled,
} from "../../lib/supabase";
import { registrationSchema } from "../../lib/validation";
import { Button } from "../../components/ui";
export default function AuthPage() {
  const { pathname } = useLocation(),
    navigate = useNavigate(),
    { session } = useAuth(),
    register = pathname === "/register",
    forgot = pathname === "/forgot-password",
    reset = pathname === "/reset-password";
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [show, setShow] = useState(false);
  if (session && !reset)
    return (
      <Navigate
        to={sessionStorage.getItem("invite-after-login") || "/dashboard"}
        replace
      />
    );
  const title = register
    ? "Создайте своё пространство"
    : forgot
      ? "Восстановление доступа"
      : reset
        ? "Новый пароль"
        : "Добро пожаловать";
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Link to="/login" className="brand">
          <span className="brand-icon">
            <Atom />
          </span>
          <span>
            Science <strong>OS</strong>
          </span>
        </Link>
        <div className="auth-story-main">
          <div className="eyebrow">
            <span className="tiny-line" /> НАУКА НАЧИНАЕТСЯ С ВОПРОСА
          </div>
          <h1>
            Большие открытия.
            <br />
            <span>
              Ваша отправная
              <br />
              точка.
            </span>
          </h1>
          <p>
            Рабочее пространство для тех, кто задаёт вопросы, проверяет гипотезы
            и создаёт новое — вместе.
          </p>
          <div className="science-visual" aria-hidden="true">
            <div className="visual-grid" />
            <div className="visual-label">
              <span className="badge blue">ЭКСПЕРИМЕНТ</span>
              <span>Наблюдайте. Измеряйте. Открывайте.</span>
            </div>
            <svg viewBox="0 0 480 180">
              <defs>
                <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="#2563eb" stopOpacity=".22" />
                  <stop offset="1" stopColor="#2563eb" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 160 C35 160 40 125 75 130 S120 160 150 100 S205 115 240 72 S285 103 320 58 S375 80 405 32 S455 40 480 10 L480 180H0Z"
                fill="url(#area)"
              />
              <path
                d="M0 160 C35 160 40 125 75 130 S120 160 150 100 S205 115 240 72 S285 103 320 58 S375 80 405 32 S455 40 480 10"
                stroke="#2563eb"
                strokeWidth="3"
                fill="none"
              />
              <path
                d="M0 170 Q100 100 170 140 T320 100 T480 80"
                stroke="#8b5cf6"
                strokeWidth="2"
                strokeDasharray="5 6"
                fill="none"
              />
            </svg>
            <div className="visual-legend">
              <span>
                <i /> Гипотеза
              </span>
              <span>
                <i /> Наблюдение
              </span>
              <span className="mono">01 — ∞</span>
            </div>
          </div>
          <div className="auth-features">
            <span>
              <FlaskConical size={17} /> Эксперименты
            </span>
            <span>
              <ChartNoAxesCombined size={17} /> Аналитика
            </span>
            <span>
              <UsersRound size={17} /> Команда
            </span>
          </div>
        </div>
        <footer>
          Для следующего поколения исследователей.
          <span>
            Research Workspace <ArrowUpRight size={14} />
          </span>
        </footer>
      </section>
      <section className="auth-form-side">
        <div className="auth-top">
          <LockKeyhole size={15} /> Ваше исследовательское пространство
        </div>
        <div className="auth-card">
          <span className="eyebrow">
            SCIENCE OS / {register ? "РЕГИСТРАЦИЯ" : "ВХОД"}
          </span>
          <h2>{title}</h2>
          <p>
            {register
              ? "Первое исследование начинается с вашего аккаунта."
              : forgot
                ? emailDeliveryEnabled
                  ? "Отправим ссылку для создания нового пароля."
                  : "Поможем найти способ вернуться в ваше пространство."
                : reset
                  ? "Используйте не менее 10 символов."
                  : "Продолжите своё следующее открытие."}
          </p>
          {!configured && (
            <div className="setup-notice">
              <strong>Подключение облака ещё не настроено</strong>
              <p>
                Регистрация и вход станут доступны после подключения проекта
                Supabase. Данные исследований хранятся только в облаке.
              </p>
            </div>
          )}
          {forgot && !emailDeliveryEnabled ? (
            <div className="setup-notice">
              <strong>Восстановление по почте не включено</strong>
              <p>
                Если вы забыли пароль, обратитесь к администратору платформы.
                Если вы ещё вошли на другом устройстве, измените пароль в
                настройках аккаунта.
              </p>
            </div>
          ) : success ? (
            <div className="success-panel">
              <Check />
              <h3>{success}</h3>
              <p>Проверьте почту. Откройте ссылку в этом же браузере.</p>
              <Link to="/login">Вернуться ко входу</Link>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                setBusy(true);
                setError("");
                const f = new FormData(e.currentTarget),
                  email = String(f.get("email") ?? ""),
                  password = String(f.get("password") ?? "");
                try {
                  if (register) {
                    const parsed = registrationSchema.safeParse(
                      Object.fromEntries(f),
                    );
                    if (!parsed.success)
                      throw new Error(parsed.error.issues[0].message);
                    const { data, error } = await db().auth.signUp({
                      email,
                      password,
                      options: {
                        data: {
                          first_name: f.get("first_name"),
                          last_name: f.get("last_name"),
                        },
                        emailRedirectTo: appUrl(),
                      },
                    });
                    if (error) throw error;
                    if (data.session) toast.success("Аккаунт создан");
                    else setSuccess("Подтвердите адрес электронной почты");
                  } else if (forgot) {
                    const { error } = await db().auth.resetPasswordForEmail(
                      email,
                      { redirectTo: appUrl() + "?recovery=1" },
                    );
                    if (error) throw error;
                    setSuccess("Если аккаунт существует, письмо отправлено");
                  } else if (reset) {
                    if (password.length < 10 || password !== f.get("confirm"))
                      throw new Error(
                        "Пароли должны совпадать и содержать минимум 10 символов",
                      );
                    const { error } = await db().auth.updateUser({ password });
                    if (error) throw error;
                    toast.success("Пароль обновлён");
                    navigate("/dashboard");
                  } else {
                    const { error } = await db().auth.signInWithPassword({
                      email,
                      password,
                    });
                    if (error) throw error;
                    // Auth state owns the redirect. A second navigate here can race
                    // with the user's first navigation after the dashboard appears.
                  }
                } catch (e) {
                  setError(
                    e instanceof Error && !("status" in e)
                      ? e.message
                      : "Не удалось войти. Проверьте email, пароль и соединение.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {register && (
                <div className="form-grid">
                  <label className="field">
                    <span>Имя</span>
                    <input
                      name="first_name"
                      autoComplete="given-name"
                      required
                      maxLength={100}
                    />
                  </label>
                  <label className="field">
                    <span>Фамилия</span>
                    <input
                      name="last_name"
                      autoComplete="family-name"
                      required
                      maxLength={100}
                    />
                  </label>
                </div>
              )}
              {!reset && (
                <label className="field">
                  <span>Электронная почта</span>
                  <input
                    name="email"
                    type="email"
                    placeholder="you@school.edu"
                    autoComplete="email"
                    required
                    maxLength={254}
                  />
                </label>
              )}
              {!forgot && (
                <label className="field">
                  <span>Пароль</span>
                  <div className="password-field">
                    <input
                      name="password"
                      type={show ? "text" : "password"}
                      placeholder={
                        register || reset
                          ? "Не менее 10 символов"
                          : "Введите пароль"
                      }
                      autoComplete={
                        register || reset ? "new-password" : "current-password"
                      }
                      required
                      minLength={register || reset ? 10 : 1}
                      maxLength={128}
                    />
                    <button
                      type="button"
                      onClick={() => setShow(!show)}
                      aria-label={show ? "Скрыть пароль" : "Показать пароль"}
                    >
                      {show ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>
              )}
              {(register || reset) && (
                <label className="field">
                  <span>Повтор пароля</span>
                  <input
                    name="confirm"
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    maxLength={128}
                  />
                </label>
              )}
              {!register && !forgot && !reset && (
                <div className="forgot-row">
                  <Link to="/forgot-password">Забыли пароль?</Link>
                </div>
              )}
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
              <Button
                variant="primary"
                className="auth-submit"
                disabled={!configured || busy}
              >
                {busy
                  ? "Подождите…"
                  : register
                    ? "Создать аккаунт"
                    : forgot
                      ? "Отправить ссылку"
                      : reset
                        ? "Сохранить пароль"
                        : "Войти в пространство"}
              </Button>
            </form>
          )}
          <div className="auth-switch">
            {register || forgot || reset ? (
              <>
                <span>Уже есть аккаунт?</span>
                <Link to="/login">Войти</Link>
              </>
            ) : (
              <>
                <span>Впервые здесь?</span>
                <Link to="/register">Создать аккаунт</Link>
              </>
            )}
          </div>
          <div className="auth-divider" />
          <p className="auth-note">
            <LockKeyhole size={14} /> Ваши исследования доступны только вашей
            команде.
            <br />
            Вы сами решаете, чем поделиться.
          </p>
          <Link className="library-link" to="/publications">
            Посмотреть опубликованные исследования
          </Link>
        </div>
        <div className="auth-bottom">
          Science OS <span>Идеи становятся открытиями.</span>
        </div>
      </section>
    </main>
  );
}
