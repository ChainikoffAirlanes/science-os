import { db } from "./supabase";
import type {
  Dataset,
  Experiment,
  Parameter,
  Observation,
  Cell,
  Value,
} from "../types";
type Filters = Record<string, string | null>;
export async function list<T>(
  table: string,
  filters: Filters = {},
  order = "created_at",
  limit = 10000,
): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; offset < limit; offset += 1000) {
    let q = db().from(table).select("*");
    for (const [k, v] of Object.entries(filters))
      q = v === null ? q.is(k, null) : q.eq(k, v);
    const { data, error } = await q
      .order(
        table === "project_members" && order === "created_at"
          ? "joined_at"
          : order,
        {
          ascending: order === "sort_order" || order === "row_number",
        },
      )
      .range(offset, Math.min(offset + 999, limit - 1));
    if (error) throw error;
    result.push(...(data as T[]));
    if (data.length < Math.min(1000, limit - offset)) break;
  }
  return result;
}
export async function one<T>(table: string, id: string): Promise<T> {
  const { data, error } = await db()
    .from(table)
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as T;
}
export async function insert<T>(table: string, value: object): Promise<T> {
  const { data, error } = await db()
    .from(table)
    .insert(value)
    .select()
    .single();
  if (error) throw error;
  return data as T;
}
export async function remove(table: string, id: string) {
  const { error } = await db()
    .from(table)
    .delete()
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw error;
}
export async function rpc<T>(fn: string, args: object): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw error;
  return data as T;
}
export class ConflictError<T = unknown> extends Error {
  current: T;
  constructor(current: T) {
    super(
      "Другой участник уже изменил эту запись. Загрузите новую версию и повторите изменение.",
    );
    this.current = current;
  }
}
export async function update<T>(
  entity: string,
  id: string,
  patch: object,
  version = 1,
) {
  const result = await rpc<{ conflict: boolean; current: T }>("update_record", {
    entity,
    eid: id,
    patch,
    expected_version: version,
  });
  if (result.conflict) throw new ConflictError(result.current);
  return result.current;
}
export async function saveCell(
  rid: string,
  paramid: string,
  value: Value,
  version: number,
) {
  const result = await rpc<{ conflict: boolean; current: Cell | null }>(
    "save_cell",
    { rid, paramid, new_value: value, expected_version: version },
  );
  if (result.conflict) throw new ConflictError(result.current);
  return result.current!;
}
export async function dataset(experiment: Experiment): Promise<Dataset> {
  const [parameters, rows] = await Promise.all([
    list<Parameter>(
      "experiment_parameters",
      { experiment_id: experiment.id },
      "sort_order",
      100,
    ),
    list<Observation>(
      "experiment_rows",
      { experiment_id: experiment.id },
      "row_number",
      10000,
    ),
  ]);
  // PostgREST default caps are handled by explicit ranges for all cells.
  const cells: Cell[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await db()
      .from("experiment_cells")
      .select("*")
      .eq("experiment_id", experiment.id)
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    cells.push(...(data as Cell[]));
    if (data.length < 1000) break;
    offset += 1000;
    if (offset > 100000) throw new Error("Набор слишком большой для браузера");
  }
  return { experiment, parameters, rows, cells };
}
export function errorMessage(error: unknown) {
  if (error instanceof ConflictError) return error.message;
  if (error instanceof Error && !("code" in error)) return error.message;
  return "Не удалось выполнить операцию. Проверьте соединение и права доступа, затем повторите.";
}
