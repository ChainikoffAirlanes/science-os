import { useState } from "react";
import type { ReactNode, ButtonHTMLAttributes } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { LoaderCircle, X, FlaskConical, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "../lib/api";
import { useQuery } from "@tanstack/react-query";
import { db } from "../lib/supabase";
const buttonVariants = cva("button", {
  variants: {
    variant: {
      primary: "primary",
      secondary: "secondary",
      ghost: "ghost",
      danger: "danger",
    },
  },
  defaultVariants: { variant: "secondary" },
});
export function Button({
  asChild,
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={twMerge(clsx(buttonVariants({ variant }), className))}
      {...props}
    />
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Spinner() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" /> Загрузка данных…
    </div>
  );
}
export function Skeleton() {
  return (
    <div className="skeleton-grid" role="status" aria-label="Загрузка">
      <div />
      <div />
      <div />
    </div>
  );
}
export function Empty({
  title = "Пока здесь пусто",
  text,
  action,
}: {
  title?: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <FlaskConical size={30} />
      </span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle />
      <h3>Не удалось загрузить данные</h3>
      <p>{errorMessage(error)}</p>
      {retry && <Button onClick={retry}>Повторить</Button>}
    </div>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  side = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  side?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className={`dialog-content ${side ? "dialog-side" : ""}`}
          aria-describedby={description ? undefined : ""}
        >
          <div className="dialog-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              {description && (
                <Dialog.Description>{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" aria-label="Закрыть">
                <X size={20} />
              </Button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export interface FieldSpec {
  name: string;
  label: string;
  type?:
    | "text"
    | "textarea"
    | "select"
    | "date"
    | "number"
    | "email"
    | "password"
    | "checkbox";
  options?: { value: string; label: string }[];
  required?: boolean;
  maxLength?: number;
  hint?: string;
  min?: number;
  suggestions?: string[];
}
export function Field({
  field,
  value,
  onChange,
}: {
  field: FieldSpec;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label
      className={`field ${field.type === "checkbox" ? "check-field" : ""}`}
    >
      <span>
        {field.label}
        {field.required ? " *" : ""}
      </span>
      {field.type === "textarea" ? (
        <textarea
          aria-label={field.label + (field.required ? " *" : "")}
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          maxLength={field.maxLength ?? 30000}
        />
      ) : field.type === "select" ? (
        <select
          aria-label={field.label + (field.required ? " *" : "")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        >
          {field.options?.map((o) => (
            <option value={o.value} key={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === "checkbox" ? (
        <input
          type="checkbox"
          aria-label={field.label}
          checked={value === "true"}
          onChange={(e) => onChange(String(e.target.checked))}
        />
      ) : (
        <input
          aria-label={field.label + (field.required ? " *" : "")}
          list={field.suggestions ? `suggest-${field.name}` : undefined}
          type={field.type ?? "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          maxLength={field.maxLength ?? 200}
          min={field.min}
        />
      )}
      {field.suggestions && (
        <datalist id={`suggest-${field.name}`}>
          {field.suggestions.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      )}
      {field.hint && <small>{field.hint}</small>}
    </label>
  );
}
export function DataForm({
  fields,
  initial = {},
  onSave,
  submit = "Сохранить",
  cancel,
}: {
  fields: FieldSpec[];
  initial?: Record<string, string>;
  onSave: (v: Record<string, string>) => Promise<void>;
  submit?: string;
  cancel?: () => void;
}) {
  const [values, setValues] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="data-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          await onSave(values);
        } catch (e) {
          const m = errorMessage(e);
          setError(m);
          toast.error(m);
        } finally {
          setBusy(false);
        }
      }}
    >
      {fields.map((f) => (
        <Field
          key={f.name}
          field={f}
          value={values[f.name] ?? ""}
          onChange={(v) => setValues((prev) => ({ ...prev, [f.name]: v }))}
        />
      ))}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        {cancel && (
          <Button type="button" onClick={cancel}>
            Отмена
          </Button>
        )}
        <Button variant="primary" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={16} /> : null}
          {busy ? "Сохранение…" : submit}
        </Button>
      </div>
    </form>
  );
}
export function Confirm({
  open,
  onClose,
  title,
  text,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  text: string;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && !busy && onClose()}
      title={title}
      description={text}
    >
      <div className="form-actions">
        <Button onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Выполнение…" : "Подтвердить"}
        </Button>
      </div>
    </Modal>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="header-actions">{action}</div>}
    </div>
  );
}
export function Avatar({
  name,
  size = 32,
  path,
}: {
  name: string;
  size?: number;
  path?: string | null;
}) {
  const image = useQuery({
    queryKey: ["avatar", path],
    enabled: !!path,
    staleTime: 45000,
    retry: 0,
    queryFn: async () => {
      const { data, error } = await db()
        .storage.from("science-profile-avatars")
        .createSignedUrl(path!, 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  return (
    <span className="avatar" style={{ width: size, height: size }} title={name}>
      {image.data ? (
        <img
          src={image.data}
          alt={name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "50%",
          }}
        />
      ) : (
        name
          .split(" ")
          .map((n) => n[0])
          .slice(0, 2)
          .join("")
          .toUpperCase() || "И"
      )}
    </span>
  );
}
