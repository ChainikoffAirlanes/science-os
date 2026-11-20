import { z } from "zod";
import type { Parameter, Value } from "../types";
export const categories = [
  "Физика",
  "Химия",
  "Биология",
  "Математика",
  "Информатика",
  "Экология",
  "Астрономия",
  "Другое",
];
export const statuses: Record<string, string> = {
  planned: "Планируется",
  active: "В работе",
  completed: "Завершён",
  archived: "В архиве",
  todo: "К выполнению",
  in_progress: "В работе",
  done: "Готово",
};
export const sectionLabels: Record<string, string> = {
  description: "Описание",
  hypothesis: "Гипотеза",
  objectives: "Цели исследования",
  methodology: "Методология",
  expected_results: "Ожидаемые результаты",
  conclusions: "Выводы",
};
export const projectSchema = z
  .object({
    title: z.string().trim().min(1, "Введите название").max(200),
    description: z.string().max(10000),
    science_category: z.string(),
    hypothesis: z.string().max(30000),
    objectives: z.string().max(30000),
    methodology: z.string().max(30000),
    expected_results: z.string().max(30000),
    conclusions: z.string().max(30000),
    status: z.enum(["planned", "active", "completed", "archived"]),
    start_date: z.string(),
    due_date: z.string(),
  })
  .refine((v) => !v.due_date || !v.start_date || v.due_date >= v.start_date, {
    message: "Завершение не может быть раньше начала",
    path: ["due_date"],
  });
export const registrationSchema = z
  .object({
    first_name: z.string().trim().min(1, "Укажите имя").max(100),
    last_name: z.string().trim().min(1, "Укажите фамилию").max(100),
    email: z.email("Проверьте email"),
    password: z.string().min(10, "Минимум 10 символов").max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Пароли не совпадают",
  });
export function parseValue(
  raw: string,
  p: Pick<Parameter, "value_type" | "required">,
): Value {
  if (raw.trim() === "") {
    if (p.required) throw new Error("Обязательное значение");
    return null;
  }
  if (p.value_type === "number") {
    const n = Number(raw.trim().replace(",", "."));
    if (!Number.isFinite(n)) throw new Error("Введите конечное число");
    return n;
  }
  if (p.value_type === "boolean") {
    if (["true", "1", "да"].includes(raw.toLowerCase())) return true;
    if (["false", "0", "нет"].includes(raw.toLowerCase())) return false;
    throw new Error("Укажите true или false");
  }
  if (p.value_type === "datetime") {
    if (Number.isNaN(Date.parse(raw))) throw new Error("Некорректная дата");
    return new Date(raw).toISOString();
  }
  if (raw.length > 5000) throw new Error("Максимум 5000 символов");
  return raw;
}
const mime: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  csv: "text/csv",
  txt: "text/plain",
};
export function validateFile(file: Pick<File, "name" | "size" | "type">) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!mime[ext]) throw new Error("Этот тип файла не поддерживается");
  if (file.size === 0 || file.size > 10 * 1024 * 1024)
    throw new Error("Размер файла должен быть от 1 байта до 10 МБ");
  if (
    file.type &&
    ![
      mime[ext],
      "application/octet-stream",
      ...(ext === "csv" ? ["application/vnd.ms-excel", "text/plain"] : []),
    ].includes(file.type)
  )
    throw new Error("Тип файла не соответствует расширению");
  return mime[ext];
}
export function canEdit(role: string | null | undefined) {
  return role === "owner" || role === "editor";
}
export function date(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "Не указан";
}

export const researchTypes = [
  "Экспериментальное",
  "Теоретическое",
  "Наблюдательное",
  "Прикладное",
  "Обзорное",
  "Междисциплинарное",
];
