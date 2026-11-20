import { useState } from "react";
import {
  NavLink,
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Atom,
  LayoutDashboard,
  FolderKanban,
  BookOpen,
  GraduationCap,
  Bell,
  UserRound,
  Settings,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Search,
  ChevronRight,
  PanelLeftClose,
  FlaskConical,
  BarChart3,
  Files,
  UsersRound,
  CheckSquare,
  FileText,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { db } from "../lib/supabase";
import { list } from "../lib/api";
import type { Notification, Project } from "../types";
import { Avatar, Button, Modal, Empty } from "./ui";
const nav = [
  { to: "/dashboard", name: "Обзор", icon: LayoutDashboard },
  { to: "/projects", name: "Мои проекты", icon: FolderKanban },
  { to: "/publications", name: "Библиотека исследований", icon: BookOpen },
  { to: "/opportunities", name: "Возможности", icon: GraduationCap },
  { to: "/notifications", name: "Уведомления", icon: Bell },
  { to: "/profile", name: "Мой профиль", icon: UserRound },
  { to: "/settings", name: "Настройки", icon: Settings },
];
export function toggleTheme() {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("science-theme", next);
}
export default function Layout() {
  const [open, setOpen] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [search, setSearch] = useState(false),
    [term, setTerm] = useState(""),
    location = useLocation(),
    navigate = useNavigate(),
    { profile, role, session } = useAuth();
  const notifications = useQuery({
    queryKey: ["notifications", session?.user.id],
    queryFn: () =>
      list<Notification>("notifications", { recipient_id: session!.user.id }),
    enabled: !!session,
    refetchInterval: 30000,
  });
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => list<Project>("projects"),
  });
  const unread = notifications.data?.filter((n) => !n.read_at).length ?? 0,
    current = nav.find((n) => location.pathname.startsWith(n.to)),
    name = profile?.display_name || "Исследователь",
    projectId = location.pathname.match(/^\/projects\/([^/]+)/)?.[1],
    project = projects.data?.find((p) => p.id === projectId);
  return (
    <div className={`app-shell ${collapsed ? "collapsed" : ""}`}>
      <div
        className={`sidebar-backdrop ${open ? "show" : ""}`}
        onClick={() => setOpen(false)}
      />
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-brand">
          <Link to="/dashboard" className="brand">
            <span className="brand-icon">
              <Atom />
            </span>
            <div>
              Science <strong>OS</strong>
              <small>Исследовательская платформа</small>
            </div>
          </Link>
          <Button
            variant="ghost"
            className="sidebar-collapse"
            aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
            onClick={() => setCollapsed(!collapsed)}
          >
            <PanelLeftClose size={17} />
          </Button>
          <Button
            variant="ghost"
            className="mobile-close"
            aria-label="Закрыть меню"
            onClick={() => setOpen(false)}
          >
            <X />
          </Button>
        </div>
        <div className="workspace-selector">
          <span className="workspace-letter">S</span>
          <div>
            Моё пространство<small>Научное сообщество</small>
          </div>
        </div>
        <nav>
          <span className="nav-section">РАБОЧЕЕ ПРОСТРАНСТВО</span>
          {nav.map((n, i) => (
            <div key={n.to}>
              {i === 4 && <span className="nav-section personal">ЛИЧНОЕ</span>}
              <NavLink to={n.to} onClick={() => setOpen(false)} title={n.name}>
                <n.icon size={19} />
                <span>{n.name}</span>
                {n.to === "/notifications" && unread > 0 && <b>{unread}</b>}
              </NavLink>
            </div>
          ))}
        </nav>
        {project && (
          <div className="sidebar-current">
            <span className="nav-section">ТЕКУЩИЙ ПРОЕКТ</span>
            <Link to={`/projects/${project.id}`}>
              <FlaskIcon />
              {project.title}
            </Link>
            <nav aria-label="Проект в меню">
              {[
                ["", "Обзор", FolderKanban],
                ["experiments", "Эксперименты", FlaskConical],
                ["analytics", "Аналитика", BarChart3],
                ["files", "Файлы", Files],
                ["team", "Команда", UsersRound],
                ["tasks", "Задачи", CheckSquare],
                ["report", "Отчёт", FileText],
              ].map(([path, label, Icon]) => {
                const ItemIcon = Icon as typeof FolderKanban;
                return (
                  <NavLink
                    key={String(path)}
                    end={path === ""}
                    to={`/projects/${project.id}${path ? "/" + path : ""}`}
                    title={String(label)}
                    onClick={() => setOpen(false)}
                  >
                    <ItemIcon size={17} />
                    <span>{String(label)}</span>
                  </NavLink>
                );
              })}
            </nav>
          </div>
        )}
        <div className="sidebar-foot">
          <div className="sidebar-help">
            <span className="eyebrow">ОТ ВОПРОСА К ОТКРЫТИЮ</span>
            <p>
              Каждое наблюдение
              <br />
              имеет значение.
            </p>
            <div className="help-orbit">
              <Atom size={50} />
            </div>
          </div>
          <div className="account">
            <Avatar name={name} path={profile?.avatar_path} />
            <div>
              <strong>{name}</strong>
              <small>
                {role === "student"
                  ? "Исследователь"
                  : role === "teacher"
                    ? "Преподаватель"
                    : "Администратор"}
              </small>
            </div>
            <Button
              variant="ghost"
              aria-label="Выйти"
              onClick={async () => {
                await db().auth.signOut();
                navigate("/login");
              }}
            >
              <LogOut size={17} />
            </Button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <Button
              variant="ghost"
              className="mobile-menu"
              aria-label="Открыть меню"
              onClick={() => setOpen(true)}
            >
              <Menu />
            </Button>
            <span>Пространство</span>
            <ChevronRight size={14} />
            <strong>{project?.title || current?.name || "Исследование"}</strong>
          </div>
          <div className="topbar-actions">
            <Button
              variant="ghost"
              aria-label="Поиск"
              onClick={() => setSearch(true)}
            >
              <Search size={18} />
              <span className="search-shortcut">Поиск</span>
            </Button>
            <Button
              variant="ghost"
              aria-label="Переключить тему"
              onClick={toggleTheme}
            >
              <Sun size={18} className="sun" />
              <Moon size={18} className="moon" />
            </Button>
            <Link
              to="/notifications"
              className="notification-button"
              aria-label={`Уведомления: ${unread}`}
            >
              <Bell size={19} />
              {unread > 0 && <i />}
            </Link>
            <Link to="/profile">
              <Avatar name={name} path={profile?.avatar_path} />
            </Link>
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
        <footer className="workspace-footer">
          <span>Science OS · Исследовательское пространство</span>
          <span>Любопытство. Данные. Открытия.</span>
        </footer>
      </div>
      <Modal open={search} onOpenChange={setSearch} title="Поиск проектов">
        <input
          autoFocus
          placeholder="Название исследования…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <div className="search-results">
          {projects.data
            ?.filter((p) => p.title.toLowerCase().includes(term.toLowerCase()))
            .map((p) => (
              <Link
                key={p.id}
                to={`/projects/${p.id}`}
                onClick={() => setSearch(false)}
              >
                {p.title}
                <ChevronRight size={16} />
              </Link>
            ))}
          {!projects.data?.length && <Empty title="Проектов пока нет" />}
        </div>
      </Modal>
    </div>
  );
}
function FlaskIcon() {
  return <FolderKanban size={17} />;
}
