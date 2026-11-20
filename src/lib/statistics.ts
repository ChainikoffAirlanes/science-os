import type { Dataset, Value } from "../types";
export function statistics(values: Value[]) {
  const nums = values
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    .sort((a, b) => a - b);
  const n = nums.length;
  if (!n)
    return {
      count: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      std: null,
    };
  const scale = Math.max(Math.abs(nums[0]), Math.abs(nums[n - 1]));
  const normalized = nums.map((v) => (scale ? v / scale : 0));
  let sum = 0,
    correction = 0;
  for (const value of normalized) {
    const adjusted = value - correction,
      next = sum + adjusted;
    correction = next - sum - adjusted;
    sum = next;
  }
  const normalizedMean = sum / n;
  const mean = normalizedMean * scale;
  return {
    count: n,
    min: nums[0],
    max: nums[n - 1],
    mean,
    median: n % 2 ? nums[(n - 1) / 2] : nums[n / 2 - 1] / 2 + nums[n / 2] / 2,
    std:
      n > 1
        ? Math.sqrt(
            normalized.reduce((a, b) => a + (b - normalizedMean) ** 2, 0) /
              (n - 1),
          ) * scale
        : null,
  };
}
export function chartData(
  d: Dataset,
  xId: string,
  yIds: string[],
  from = 0,
  to = d.rows.length,
) {
  const map = new Map(
    d.cells.map((c) => [
      `${c.experiment_row_id}:${c.experiment_parameter_id}`,
      c.value,
    ]),
  );
  return d.rows
    .slice(from, to)
    .map((r, i) => {
      const point: Record<string, Value> = {
        x: xId ? (map.get(`${r.id}:${xId}`) ?? null) : i + from + 1,
      };
      for (const id of yIds) {
        const value = map.get(`${r.id}:${id}`);
        point[id] =
          typeof value === "number" && Number.isFinite(value) ? value : null;
      }
      return point;
    })
    .filter((p) => p.x !== null);
}
export function compatibleUnits(units: string[]) {
  return new Set(units.map((x) => x.trim())).size <= 1;
}
