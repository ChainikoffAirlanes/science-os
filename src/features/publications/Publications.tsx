import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { read } from "../../lib/api";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Search, ArrowUpRight } from "lucide-react";
import { remove } from "../../lib/api";
import { configured } from "../../lib/supabase";
import {
  categories,
  date,
  sectionLabels,
  researchTypes,
} from "../../lib/validation";
import { useAuth } from "../../hooks/useAuth";
import { Markdown } from "../projects/Workspace";
import type { Publication } from "../../types";
import {
  Badge,
  Button,
  Confirm,
  Empty,
  ErrorState,
  PageHeader,
  Skeleton,
} from "../../components/ui";
export function Publications() {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [researchType, setResearchType] = useState(""),
    [from, setFrom] = useState(""),
    [author, setAuthor] = useState(""),
    q = useQuery({
      queryKey: ["publications"],
      queryFn: ({ signal }) =>
        read(signal).list<Publication>("publications", {}, "published_at"),
      enabled: configured,
    });
  const debouncedSearch = useDebouncedValue(search);
  const items =
    q.data?.filter(
      (p) =>
        (p.title + " " + p.abstract)
          .toLowerCase()
          .includes(debouncedSearch.toLowerCase()) &&
        (!category || p.public_content.category === category) &&
        (!researchType || p.public_content.research_type === researchType) &&
        (!from || p.published_at >= from) &&
        (!author ||
          p.public_content.authors.some((a) =>
            a.toLowerCase().includes(author.toLowerCase()),
          )),
    ) ?? [];
  return (
    <>
      <PageHeader
        eyebrow="ОТКРЫТОЕ НАУЧНОЕ СООБЩЕСТВО"
        title="Библиотека исследований"
        description="Идеи, проверенные экспериментом. Открытия, которыми стоит поделиться."
      />
      <div className="library-banner">
        <BookOpen size={40} />
        <div>
          <h2>Исследования становятся ценнее, когда ими делятся.</h2>
          <p>
            Изучайте опубликованные работы и находите новые вопросы для своих
            проектов.
          </p>
        </div>
      </div>
      <div className="toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            placeholder="Найти исследование…"
            aria-label="Поиск публикаций"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Область исследования"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Все научные области</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Тип исследования"
          value={researchType}
          onChange={(e) => setResearchType(e.target.value)}
        >
          <option value="">Все типы исследований</option>
          {researchTypes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input
          type="date"
          aria-label="Опубликовано после"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <input
          placeholder="Автор"
          aria-label="Автор"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
        />
      </div>
      {!configured ? (
        <Empty
          title="Библиотека пока не подключена"
          text="Публикации появятся после настройки облачной базы."
        />
      ) : q.isLoading ? (
        <Skeleton />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : !items.length ? (
        <Empty
          title="Первые открытия ещё впереди"
          text="Здесь появятся исследования, которые авторы решили опубликовать."
        />
      ) : (
        <div className="project-grid">
          {items.map((p) => (
            <Link
              className="card publication-card"
              to={`/publications/${p.id}`}
              key={p.id}
            >
              <div className="publication-top">
                <BookOpen size={24} />
                <Badge tone="blue">{p.public_content.category}</Badge>
              </div>
              <h2>{p.title}</h2>
              <p>
                {p.abstract ||
                  "Откройте работу, чтобы прочитать опубликованные материалы."}
              </p>
              <small>
                {p.public_content.authors.join(", ") || "Автор не указан"} ·{" "}
                {date(p.published_at)}
              </small>
              <span className="text-link">
                Читать исследование <ArrowUpRight size={16} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
export function PublicationDetail() {
  const { id = "" } = useParams(),
    q = useQuery({
      queryKey: ["publication", id],
      queryFn: ({ signal }) =>
        read(signal).one<Publication>("publications", id),
      enabled: configured,
    }),
    [deleting, setDeleting] = useState(false),
    { session } = useAuth(),
    client = useQueryClient();
  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const p = q.data;
  return (
    <>
      <Link className="back-link" to="/publications">
        Библиотека исследований
      </Link>
      <PageHeader
        title={p.title}
        description={`${p.public_content.authors.join(", ") || "Автор не указан"} · ${date(p.published_at)}`}
        action={<Badge tone="blue">{p.public_content.category}</Badge>}
      />
      <article className="card publication-article">
        {Object.entries(p.public_content.sections).map(([k, v]) => (
          <section key={k}>
            <h2>{sectionLabels[k] ?? k}</h2>
            <Markdown text={v || "Раздел не заполнен автором исследования."} />
          </section>
        ))}
        {p.public_content.experiments?.map((e, i) => (
          <section key={i}>
            <h2>{e.title}</h2>
            <div className="table-scroll">
              <table className="preview-table">
                <thead>
                  <tr>
                    {e.parameters.map((param) => (
                      <th key={param.id}>
                        {param.name}
                        {param.unit && ` (${param.unit})`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {e.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((v, j) => (
                        <td key={j}>{String(v ?? "—")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </article>
      {session?.user.id === p.published_by && (
        <Button
          className="mt-4"
          variant="danger"
          onClick={() => setDeleting(true)}
        >
          Отозвать свою публикацию
        </Button>
      )}
      <Confirm
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Отозвать публикацию?"
        text="Снимок исследования исчезнет из библиотеки. Исходный проект сохранится. Отозвать публикацию может только владелец."
        onConfirm={async () => {
          await remove("publications", p.id);
          await client.invalidateQueries({ queryKey: ["publications"] });
          location.hash = "/publications";
        }}
      />
    </>
  );
}
