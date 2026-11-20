import { read } from "../../lib/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type {
  ColumnDef,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import {
  ArrowLeft,
  Plus,
  Download,
  Upload,
  Trash2,
  ArrowDownUp,
  Check,
  WifiOff,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "../projects/Workspace";
import {
  dataset,
  list,
  one,
  insert,
  remove,
  saveCell,
  update,
  rpc,
  ConflictError,
  errorMessage,
} from "../../lib/api";
import { canEdit, parseValue } from "../../lib/validation";
import {
  datasetMatrix,
  exportData,
  mapImport,
  parseCSV,
  readWorkbook,
} from "../../lib/data-files";
import type {
  Cell,
  Dataset,
  Experiment,
  Observation,
  Parameter,
  Value,
} from "../../types";
import {
  Avatar,
  Button,
  Confirm,
  DataForm,
  Empty,
  ErrorState,
  Modal,
  Skeleton,
} from "../../components/ui";
function CellInput({
  cell,
  row,
  p,
  editable,
  onChanged,
  onPending,
  onDirty,
}: {
  cell: Cell | undefined;
  row: Observation;
  p: Parameter;
  editable: boolean;
  onChanged: () => void;
  onPending: (n: number) => void;
  onDirty: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(cell?.value ?? "")),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState<Cell | null | undefined>(undefined),
    dirty = useRef(false),
    baseVersion = useRef(cell?.version ?? 0),
    saving = useRef(false),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!dirty.current && !saving.current) {
      setDraft(String(cell?.value ?? ""));
      baseVersion.current = cell?.version ?? 0;
    }
  }, [cell?.value, cell?.version]);
  useEffect(
    () => () => {
      if (dirty.current) {
        dirty.current = false;
        onDirty(-1);
      }
    },
    [onDirty],
  );
  async function save(version = baseVersion.current) {
    if (saving.current || !dirty.current) return;
    let value: Value;
    try {
      value = parseValue(draft, p);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setBusy(true);
    saving.current = true;
    onPending(1);
    setError("");
    try {
      const c = await saveCell(row.id, p.id, value, version);
      baseVersion.current = c.version;
      if (dirty.current) {
        dirty.current = false;
        onDirty(-1);
      }
      setConflict(undefined);
      onChanged();
    } catch (e) {
      if (e instanceof ConflictError) setConflict(e.current as Cell | null);
      else setError(errorMessage(e));
    } finally {
      saving.current = false;
      setBusy(false);
      onPending(-1);
    }
  }
  if (!editable)
    return (
      <span className="readonly-cell">
        {cell?.value === null ? "—" : String(cell?.value ?? "—")}
      </span>
    );
  return (
    <div
      className={`cell-editor ${error || conflict !== undefined ? "cell-error" : ""}`}
    >
      <input
        ref={input}
        aria-label={`${p.name}, наблюдение ${row.row_number}`}
        value={draft}
        inputMode={p.value_type === "number" ? "decimal" : undefined}
        disabled={busy}
        onFocus={() => {
          if (!dirty.current)
            baseVersion.current = Math.max(
              baseVersion.current,
              cell?.version ?? 0,
            );
        }}
        onChange={(e) => {
          if (!dirty.current) onDirty(1);
          dirty.current = true;
          setDraft(e.target.value);
          setError("");
        }}
        onBlur={() => {
          if (conflict === undefined) void save();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void save();
            input.current?.blur();
          }
          if (e.key === "Escape") {
            if (dirty.current) onDirty(-1);
            dirty.current = false;
            setDraft(String(cell?.value ?? ""));
            setError("");
            input.current?.blur();
          }
        }}
      />
      {error && (
        <span className="cell-message" role="alert">
          {error}
          <button onClick={() => void save()}>Повторить</button>
        </span>
      )}
      <Modal
        open={conflict !== undefined}
        onOpenChange={(v) => {
          if (!v) {
            if (dirty.current) onDirty(-1);
            dirty.current = false;
            setDraft(String(conflict?.value ?? ""));
            baseVersion.current = conflict?.version ?? 0;
            setConflict(undefined);
            onChanged();
          }
        }}
        title="Конфликт изменений"
        description="Другой участник изменил эту ячейку. Ваше значение не перезаписало его данные."
      >
        <dl className="conflict-values">
          <dt>Ваше значение</dt>
          <dd>{draft || "Пусто"}</dd>
          <dt>Текущее значение</dt>
          <dd>{String(conflict?.value ?? "Пусто")}</dd>
        </dl>
        <div className="form-actions">
          <Button
            disabled={busy}
            onClick={() => {
              if (dirty.current) onDirty(-1);
              dirty.current = false;
              setDraft(String(conflict?.value ?? ""));
              baseVersion.current = conflict?.version ?? 0;
              setConflict(undefined);
              onChanged();
            }}
          >
            Принять текущее
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void save(conflict?.version ?? 0)}
          >
            Применить моё
          </Button>
        </div>
      </Modal>
    </div>
  );
}
function ImportDialog({
  open,
  onClose,
  data,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  data: Dataset;
  onDone: () => Promise<void>;
}) {
  const [rows, setRows] = useState<string[][]>([]),
    [mapping, setMapping] = useState<number[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState("");
  let parsed: Value[][] = [];
  let validation = "";
  if (rows.length) {
    try {
      parsed = mapImport(rows.slice(1), data.parameters, mapping);
    } catch (e) {
      validation = (e as Error).message;
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && !busy && onClose()}
      title="Импорт наблюдений"
      description="CSV или XLSX, первая строка — заголовки. Импорт только добавляет строки; существующие данные сохраняются."
    >
      <label className="file-drop">
        <Upload />
        <strong>Выберите CSV или Excel</strong>
        <span>До 10 МБ · до 2 000 наблюдений</span>
        <input
          aria-label="Файл для импорта"
          type="file"
          accept=".csv,.xlsx"
          disabled={busy}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy(true);
            setError("");
            try {
              if (f.size > 10 * 1024 * 1024) throw new Error("Максимум 10 МБ");
              const values = f.name.toLowerCase().endsWith(".csv")
                ? parseCSV(await f.text())
                : await readWorkbook(await f.arrayBuffer());
              if (values.length < 2) throw new Error("Нет строк данных");
              if (values.length > 2001)
                throw new Error("Максимум 2 000 строк за один импорт");
              setRows(values);
              setName(f.name);
              setMapping(
                data.parameters.map((p) =>
                  values[0].findIndex(
                    (h) => h === p.name || h === `${p.name} (${p.unit})`,
                  ),
                ),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {rows.length > 0 && (
        <>
          <h3>
            {name} · {rows.length - 1} строк
          </h3>
          <div className="mapping-fields">
            {data.parameters.map((p, i) => (
              <label className="field" key={p.id}>
                <span>
                  {p.name}
                  {p.required ? " *" : ""}
                </span>
                <select
                  aria-label={`Сопоставить ${p.name}`}
                  value={mapping[i] ?? -1}
                  onChange={(e) =>
                    setMapping((m) =>
                      m.map((v, j) => (i === j ? Number(e.target.value) : v)),
                    )
                  }
                >
                  <option value={-1}>Не импортировать</option>
                  {rows[0].map((h, j) => (
                    <option key={j} value={j}>
                      {h || `Столбец ${j + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="table-scroll">
            <table className="preview-table">
              <thead>
                <tr>
                  {data.parameters.map((p) => (
                    <th key={p.id}>{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 5).map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j}>{String(c ?? "—")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <small>
            Предпросмотр первых пяти строк. Сохранение выполняется одной
            транзакцией.
          </small>
        </>
      )}
      {(error || validation) && (
        <p className="inline-error" role="alert">
          {error || validation}
        </p>
      )}
      <div className="form-actions">
        <Button disabled={busy} onClick={onClose}>
          Отмена
        </Button>
        <Button
          variant="primary"
          disabled={
            busy || !parsed.length || !!validation || !data.parameters.length
          }
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await rpc("import_observations", {
                eid: data.experiment.id,
                parameter_ids: data.parameters.map((p) => p.id),
                values_matrix: parsed,
              });
              toast.success(`Импортировано наблюдений: ${parsed.length}`);
              await onDone();
              onClose();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Обработка…" : `Добавить ${parsed.length} строк`}
        </Button>
      </div>
    </Modal>
  );
}
export default function ExperimentEditor() {
  const { project, role, online, connected } = useWorkspace(),
    { experimentId = "" } = useParams(),
    client = useQueryClient(),
    [parameterOpen, setParameterOpen] = useState(false),
    [importOpen, setImportOpen] = useState(false),
    [editing, setEditing] = useState<Parameter | null>(null),
    [deleting, setDeleting] = useState<{ table: string; id: string } | null>(
      null,
    ),
    [filter, setFilter] = useState(""),
    [sorting, setSorting] = useState<SortingState>([]),
    [selection, setSelection] = useState<RowSelectionState>({}),
    [pending, setPending] = useState(0),
    [exporting, setExporting] = useState(false),
    [unsaved, setUnsaved] = useState(0),
    [addBusy, setAddBusy] = useState(false);
  const q = useQuery({
    queryKey: ["dataset", project.id, experimentId],
    queryFn: async ({ signal }) => {
      const e = await read(signal).one<Experiment>("experiments", experimentId);
      if (e.project_id !== project.id)
        throw new Error("Эксперимент не принадлежит проекту");
      return read(signal).dataset(e);
    },
  });
  const editable = canEdit(role),
    refresh = () => {
      void client.invalidateQueries({
        queryKey: ["dataset", project.id, experimentId],
      });
    },
    pendingRef = useRef(0),
    dirtyRef = useRef(0);
  const blocker = useBlocker(unsaved > 0 || pending > 0);
  useEffect(() => {
    if (blocker.state === "blocked" && unsaved === 0 && pending === 0)
      blocker.proceed();
  }, [blocker, unsaved, pending]);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (pendingRef.current > 0 || dirtyRef.current > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, []);
  const onPending = (n: number) => {
    pendingRef.current += n;
    setPending(pendingRef.current);
  };
  const onDirty = useCallback((n: number) => {
    dirtyRef.current = Math.max(0, dirtyRef.current + n);
    setUnsaved(dirtyRef.current);
  }, []);
  const cells = useMemo(
    () =>
      new Map(
        (q.data?.cells ?? []).map((c) => [
          `${c.experiment_row_id}:${c.experiment_parameter_id}`,
          c,
        ]),
      ),
    [q.data?.cells],
  );
  const columns: ColumnDef<Observation>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="Выделить страницу"
          checked={table.getIsAllPageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`Выбрать наблюдение ${row.original.row_number}`}
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
    },
    { accessorKey: "row_number", header: "№" },
    ...(q.data?.parameters ?? []).map((p) => ({
      id: p.id,
      accessorFn: (r: Observation) => cells.get(`${r.id}:${p.id}`)?.value ?? "",
      header: () => (
        <div className="parameter-heading">
          <span>
            {p.name}
            {p.required ? " *" : ""}
            <small>
              {p.unit ||
                {
                  number: "Число",
                  text: "Текст",
                  datetime: "Дата / время",
                  boolean: "true / false",
                }[p.value_type]}
            </small>
          </span>
          {editable && (
            <Button
              variant="ghost"
              aria-label={`Настроить параметр ${p.name}`}
              onClick={() => setEditing(p)}
            >
              ⋯
            </Button>
          )}
        </div>
      ),
      cell: ({ row }: { row: { original: Observation } }) => (
        <CellInput
          cell={cells.get(`${row.original.id}:${p.id}`)}
          row={row.original}
          p={p}
          editable={editable}
          onChanged={refresh}
          onPending={onPending}
          onDirty={onDirty}
        />
      ),
    })),
    ...(editable
      ? [
          {
            id: "delete",
            header: "",
            cell: ({ row }: { row: { original: Observation } }) => (
              <Button
                variant="ghost"
                aria-label={`Удалить наблюдение ${row.original.row_number}`}
                onClick={() =>
                  setDeleting({ table: "experiment_rows", id: row.original.id })
                }
              >
                <Trash2 size={14} />
              </Button>
            ),
          },
        ]
      : []),
  ];
  const table = useReactTable({
    data: q.data?.rows ?? [],
    columns,
    state: { sorting, globalFilter: filter, rowSelection: selection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    onRowSelectionChange: setSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (r) => r.id,
    initialState: { pagination: { pageSize: 50 } },
    autoResetPageIndex: false,
  });
  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data)
    return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  const data = q.data,
    selected = table.getSelectedRowModel().rows.map((r) => r.original.id);
  async function exportFresh(format: "csv" | "xlsx", onlySelected = false) {
    setExporting(true);
    try {
      const experiment = await one<Experiment>("experiments", experimentId),
        fresh = await dataset(experiment);
      const selectedValues = onlySelected
        ? datasetMatrix({
            ...fresh,
            rows: fresh.rows.filter((r) => selected.includes(r.id)),
          })
        : undefined;
      await exportData(fresh, format, selectedValues);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      <div className="experiment-editor-heading">
        <div>
          <Link
            className="back-link"
            to={`/projects/${project.id}/experiments`}
          >
            <ArrowLeft size={16} />
            Эксперименты
          </Link>
          <h2>{data.experiment.title}</h2>
          <span className={`sync-status ${pending || unsaved ? "saving" : ""}`}>
            {pending ? (
              <>
                <ActivityIcon /> Сохранение…
              </>
            ) : unsaved ? (
              <>Есть несохранённые изменения</>
            ) : connected ? (
              <>
                <Check size={14} /> Сохранено
              </>
            ) : (
              <>
                <WifiOff size={14} /> Проверка соединения
              </>
            )}
          </span>
        </div>
        <div className="editor-actions">
          <div className="avatar-stack">
            {online.map((u) => (
              <Avatar name={u.name + " · online"} key={u.id} />
            ))}
          </div>
          {editable && (
            <Button
              onClick={() => setImportOpen(true)}
              disabled={!data.parameters.length || unsaved > 0 || pending > 0}
            >
              <Upload size={16} />
              Импорт
            </Button>
          )}
          <details className="dropdown">
            <summary className="button secondary">
              <Download size={16} />
              Экспорт
            </summary>
            <div>
              <button
                disabled={exporting || unsaved > 0 || pending > 0}
                onClick={() => void exportFresh("csv")}
              >
                Скачать CSV
              </button>
              <button
                disabled={exporting || unsaved > 0 || pending > 0}
                onClick={() => void exportFresh("xlsx")}
              >
                Скачать Excel
              </button>
              <button
                disabled={
                  !selected.length || exporting || unsaved > 0 || pending > 0
                }
                onClick={() => void exportFresh("csv", true)}
              >
                Выбранные строки (CSV)
              </button>
            </div>
          </details>
          {editable && (
            <Button variant="primary" onClick={() => setParameterOpen(true)}>
              <Plus size={17} />
              Параметр
            </Button>
          )}
        </div>
      </div>
      <div className="table-info">
        <span>
          {data.rows.length} наблюдений · {data.parameters.length} параметров
        </span>
        <input
          placeholder="Фильтр значений…"
          aria-label="Фильтр таблицы"
          disabled={unsaved > 0 || pending > 0}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {!data.parameters.length ? (
        <div className="card">
          <Empty
            title="Какие величины вы измеряете?"
            text="Добавьте первый параметр: название, тип значения и единицу измерения."
            action={
              editable && (
                <Button onClick={() => setParameterOpen(true)}>
                  Добавить параметр
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="data-table-container">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id}>
                    {group.headers.map((h) => (
                      <th key={h.id}>
                        <div>
                          {flexRender(
                            h.column.columnDef.header,
                            h.getContext(),
                          )}
                          {h.column.getCanSort() && (
                            <button
                              aria-label={`Сортировать ${h.column.id}`}
                              disabled={unsaved > 0 || pending > 0}
                              onClick={h.column.getToggleSortingHandler()}
                            >
                              <ArrowDownUp size={12} />
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((r) => (
                  <tr key={r.id} data-selected={r.getIsSelected()}>
                    {r.getVisibleCells().map((c) => (
                      <td key={c.id}>
                        {data.parameters.some((p) => p.id === c.column.id) ? (
                          <CellInput
                            cell={cells.get(`${r.original.id}:${c.column.id}`)}
                            row={r.original}
                            p={data.parameters.find(
                              (p) => p.id === c.column.id,
                            )!}
                            editable={editable}
                            onChanged={refresh}
                            onPending={onPending}
                            onDirty={onDirty}
                          />
                        ) : (
                          flexRender(c.column.columnDef.cell, c.getContext())
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.rows.length && (
              <Empty
                title="Готово к первому наблюдению"
                text="Добавьте строку и введите результаты измерений."
              />
            )}
          </div>
          <div className="table-pagination">
            <span>
              Страница {table.getState().pagination.pageIndex + 1} из{" "}
              {Math.max(table.getPageCount(), 1)}
            </span>
            <Button
              onClick={() => table.previousPage()}
              disabled={
                !table.getCanPreviousPage() || unsaved > 0 || pending > 0
              }
            >
              Назад
            </Button>
            <Button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage() || unsaved > 0 || pending > 0}
            >
              Далее
            </Button>
            {editable && (
              <Button
                variant="primary"
                disabled={addBusy}
                onClick={async () => {
                  setAddBusy(true);
                  try {
                    await insert("experiment_rows", {
                      experiment_id: experimentId,
                      project_id: project.id,
                    });
                    refresh();
                  } catch (e) {
                    toast.error(errorMessage(e));
                  } finally {
                    setAddBusy(false);
                  }
                }}
              >
                <Plus size={16} />
                Добавить строку
              </Button>
            )}
          </div>
        </div>
      )}
      <p className="editor-hint">
        Tab — следующая ячейка · Enter — сохранить · Escape — отменить.
        Изменения сохраняются при выходе из ячейки.
      </p>
      <Modal
        open={parameterOpen || !!editing}
        onOpenChange={(v) => {
          if (!v) {
            setParameterOpen(false);
            setEditing(null);
          }
        }}
        title={editing ? "Настройки параметра" : "Новый параметр"}
      >
        <DataForm
          key={editing?.id ?? "new"}
          initial={
            editing
              ? {
                  name: editing.name,
                  value_type: editing.value_type,
                  unit: editing.unit,
                  required: String(editing.required),
                }
              : { name: "", value_type: "number", unit: "", required: "false" }
          }
          fields={[
            { name: "name", label: "Название", required: true, maxLength: 100 },
            ...(!editing
              ? [
                  {
                    name: "value_type",
                    label: "Тип данных",
                    type: "select" as const,
                    options: [
                      { value: "number", label: "Число" },
                      { value: "text", label: "Текст" },
                      { value: "datetime", label: "Дата / время" },
                      { value: "boolean", label: "Логическое значение" },
                    ],
                  },
                ]
              : []),
            {
              name: "unit",
              label: "Единица измерения",
              suggestions: [
                "м",
                "см",
                "мм",
                "кг",
                "г",
                "мл",
                "л",
                "с",
                "мин",
                "°C",
                "K",
                "ч",
                "Ом",
                "безразм.",
                "%",
                "В",
                "А",
                "Н",
                "Па",
              ],
              hint: "Например: с, °C, В, м, % — или ваша единица",
              maxLength: 50,
            },
            {
              name: "required",
              label: "Обязательное значение",
              type: "checkbox",
            },
          ]}
          onSave={async (v) => {
            if (editing)
              await update(
                "experiment_parameters",
                editing.id,
                {
                  name: v.name,
                  unit: v.unit,
                  required: v.required === "true",
                },
                editing.version,
              );
            else
              await insert("experiment_parameters", {
                name: v.name,
                unit: v.unit,
                value_type: v.value_type,
                required: v.required === "true",
                sort_order: data.parameters.length,
                project_id: project.id,
                experiment_id: experimentId,
              });
            refresh();
            setParameterOpen(false);
            setEditing(null);
            toast.success("Параметр сохранён");
          }}
        />
        {editing && (
          <Button
            variant="danger"
            onClick={() => {
              setDeleting({ table: "experiment_parameters", id: editing.id });
              setEditing(null);
            }}
          >
            Удалить параметр и его значения
          </Button>
        )}
      </Modal>
      <ImportDialog
        key={importOpen ? "open" : "closed"}
        open={importOpen}
        onClose={() => setImportOpen(false)}
        data={data}
        onDone={async () => {
          await client.cancelQueries({
            queryKey: ["dataset", project.id, experimentId],
          });
          const fresh = await dataset(data.experiment);
          client.setQueryData(["dataset", project.id, experimentId], fresh);
        }}
      />
      <Confirm
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Удалить данные?"
        text="Будут удалены соответствующие значения эксперимента. Это действие нельзя отменить."
        onConfirm={async () => {
          await remove(deleting!.table, deleting!.id);
          refresh();
        }}
      />
      <Modal
        open={blocker.state === "blocked"}
        onOpenChange={(v) => {
          if (!v && blocker.state === "blocked") blocker.reset();
        }}
        title="Есть несохранённые изменения"
        description={
          pending
            ? "Дождитесь завершения сохранения. После успешной записи переход продолжится автоматически."
            : "Сначала исправьте значения или повторите сохранение. Если покинуть редактор сейчас, несохранённый ввод будет потерян."
        }
      >
        <div className="form-actions">
          <Button
            onClick={() => blocker.state === "blocked" && blocker.reset()}
          >
            Остаться в редакторе
          </Button>
          <Button
            variant="danger"
            disabled={pending > 0}
            onClick={() => blocker.state === "blocked" && blocker.proceed()}
          >
            Покинуть без сохранения
          </Button>
        </div>
      </Modal>
      {!navigator.onLine && (
        <div className="offline-banner">
          <AlertCircle size={16} />
          Нет соединения. Не закрывайте редактор до завершения сохранения.
        </div>
      )}
    </>
  );
}
function ActivityIcon() {
  return <span className="saving-dot" />;
}
// Keep experimental data in Supabase; browser storage is never a database fallback.
export async function loadParameters(experimentId: string) {
  return list<Parameter>(
    "experiment_parameters",
    { experiment_id: experimentId },
    "sort_order",
  );
}
