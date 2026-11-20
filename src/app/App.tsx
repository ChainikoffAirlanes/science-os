import { Component, lazy, Suspense } from "react";
import type { ErrorInfo, ReactNode } from "react";
import {
  createHashRouter,
  createRoutesFromElements,
  RouterProvider,
  Link,
  Navigate,
  Outlet,
  Route,
  useLocation,
} from "react-router-dom";
import { Atom } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import Layout from "../components/Layout";
import { Button, Empty, Spinner } from "../components/ui";
import { Dashboard, Projects, NewProject } from "../features/projects/Projects";
import { Workspace, Overview } from "../features/projects/Workspace";
import { Experiments } from "../features/experiments/Experiments";
import {
  Notifications,
  Profile,
  Settings,
  InvitePage,
} from "../features/personal/Personal";
import {
  Publications,
  PublicationDetail,
} from "../features/publications/Publications";
import {
  Opportunities,
  OpportunityDetail,
} from "../features/opportunities/Opportunities";
const Auth = lazy(() => import("../features/auth/AuthPage"));
const Editor = lazy(() => import("../features/experiments/ExperimentEditor"));
const Analytics = lazy(() => import("../features/analytics/Analytics"));
const Team = lazy(() => import("../features/collaboration/Team"));
const Tasks = lazy(() => import("../features/tasks/Tasks"));
const Files = lazy(() => import("../features/files/Files"));
const Report = lazy(() => import("../features/reports/Report"));
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Do not log private research content. */
  }
  render() {
    return this.state.failed ? (
      <main className="fatal-error">
        <h1>Не удалось открыть пространство</h1>
        <p>
          Обновите страницу. Если ошибка повторяется, сообщите владельцу
          платформы.
        </p>
        <Button onClick={() => location.reload()}>Обновить страницу</Button>
      </main>
    ) : (
      this.props.children
    );
  }
}
function Protected() {
  const { session, loading } = useAuth(),
    location = useLocation();
  if (loading) return <Spinner />;
  return session ? (
    <Layout />
  ) : (
    <Navigate to="/login" replace state={{ from: location.pathname }} />
  );
}
function PublicLayout() {
  const { session, loading } = useAuth();
  if (loading) return <Spinner />;
  if (session) return <Layout />;
  return (
    <div className="public-shell">
      <header>
        <Link className="brand" to="/login">
          <span className="brand-icon">
            <Atom />
          </span>
          Science <strong>OS</strong>
        </Link>
        <Button asChild>
          <Link to="/login">Войти</Link>
        </Button>
      </header>
      <main className="public-content">
        <Outlet />
      </main>
    </div>
  );
}
function Home() {
  const { session, loading } = useAuth();
  return loading ? (
    <Spinner />
  ) : (
    <Navigate to={session ? "/dashboard" : "/login"} replace />
  );
}
function NotFound() {
  return (
    <Empty
      title="Страница не найдена"
      text="Возможно, ссылка устарела или раздел был перемещён."
      action={
        <Button asChild>
          <Link to="/dashboard">В пространство</Link>
        </Button>
      }
    />
  );
}
const router = createHashRouter(
  createRoutesFromElements(
    <Route
      element={<Outlet />}
      errorElement={
        <main className="fatal-error">
          <h1>Не удалось открыть страницу</h1>
          <p>Обновите страницу, чтобы восстановить рабочее пространство.</p>
          <Button onClick={() => location.reload()}>Обновить страницу</Button>
        </main>
      }
    >
      <Route path="/" element={<Home />} />
      {["login", "register", "forgot-password", "reset-password"].map(
        (path) => (
          <Route key={path} path={path} element={<Auth />} />
        ),
      )}
      <Route element={<PublicLayout />}>
        <Route path="publications" element={<Publications />} />
        <Route path="publications/:id" element={<PublicationDetail />} />
        <Route path="invite/:token" element={<InvitePage />} />
      </Route>
      <Route element={<Protected />}>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/new" element={<NewProject />} />
        <Route path="projects/:id" element={<Workspace />}>
          <Route index element={<Overview />} />
          <Route path="experiments" element={<Experiments />} />
          <Route path="experiments/:experimentId" element={<Editor />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="team" element={<Team />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="files" element={<Files />} />
          <Route path="report" element={<Report />} />
        </Route>
        <Route path="opportunities" element={<Opportunities />} />
        <Route path="opportunities/:id" element={<OpportunityDetail />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Route>,
  ),
);
export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Spinner />}>
        <RouterProvider router={router} />
      </Suspense>
    </ErrorBoundary>
  );
}
