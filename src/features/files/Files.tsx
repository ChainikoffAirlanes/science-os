import { read } from "../../lib/api";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FolderPlus,
  Upload,
  Folder as FolderIcon,
  FileText,
  Download,
  MoreHorizontal,
  Home,
  Image as ImageIcon,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "../projects/Workspace";
import { db, appUrl } from "../../lib/supabase";
import { insert, remove, update, errorMessage } from "../../lib/api";
import { canEdit, date, validateFile } from "../../lib/validation";
import { download } from "../../lib/data-files";
import type { Folder, ProjectFile } from "../../types";
import {
  Button,
  Confirm,
  DataForm,
  Empty,
  ErrorState,
  Modal,
  PageHeader,
  Skeleton,
} from "../../components/ui";
const bucket = "science-project-files";
export default function Files() {
  const { project, role } = useWorkspace(),
    client = useQueryClient(),
    [folder, setFolder] = useState<string | null>(null),
    [newFolder, setNewFolder] = useState(false),
    [busy, setBusy] = useState(""),
    [active, setActive] = useState<ProjectFile | null>(null),
    [deleting, setDeleting] = useState<ProjectFile | null>(null),
    [edit, setEdit] = useState(false),
    [preview, setPreview] = useState(""),
    [params] = useSearchParams();
  const openedLink = useRef<string | null>(null);
  const files = useQuery({
      queryKey: ["files", project.id],
      queryFn: ({ signal }) =>
        read(signal).list<ProjectFile>("project_files", {
          project_id: project.id,
        }),
    }),
    folders = useQuery({
      queryKey: ["folders", project.id],
      queryFn: ({ signal }) =>
        read(signal).list<Folder>("project_folders", {
          project_id: project.id,
        }),
    });
  useEffect(() => {
    const id = params.get("file");
    if (!id) openedLink.current = null;
    if (id && id !== openedLink.current && files.data) {
      const f = files.data.find((f) => f.id === id);
      if (f) {
        openedLink.current = id;
        setEdit(false);
        setActive(f);
        setFolder(f.folder_id);
      }
    }
  }, [params, files.data]);
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["files", project.id] });
    await client.invalidateQueries({ queryKey: ["folders", project.id] });
  };
  async function upload(files: FileList | null) {
    if (!files || busy) return;
    for (const file of Array.from(files)) {
      setBusy(`Проверка ${file.name}…`);
      try {
        const contentType = validateFile(file),
          path = `${project.id}/${folder ?? "root"}/${crypto.randomUUID()}`;
        setBusy(`Загрузка ${file.name}…`);
        const { error } = await db()
          .storage.from(bucket)
          .upload(path, file, { contentType, upsert: false });
        if (error) throw error;
        try {
          await insert("project_files", {
            project_id: project.id,
            folder_id: folder,
            original_name: file.name,
            storage_path: path,
            mime_type: contentType,
            size_bytes: file.size,
          });
        } catch (e) {
          const cleanup = await db().storage.from(bucket).remove([path]);
          if (cleanup.error)
            toast.error(
              "Загрузка не завершена. В хранилище остался объект без метаданных; сообщите владельцу проекта.",
            );
          throw e;
        }
        await refresh();
        toast.success(`Загружен ${file.name}`);
      } catch (e) {
        toast.error(errorMessage(e));
      } finally {
        setBusy("");
      }
    }
  }
  async function downloadFile(f: ProjectFile) {
    setBusy("Скачивание…");
    try {
      const { data, error } = await db()
        .storage.from(bucket)
        .download(f.storage_path);
      if (error) throw error;
      download(data, f.original_name);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  const current = folders.data?.find((f) => f.id === folder),
    ancestors: Folder[] = [];
  let parent = current;
  while (parent && !ancestors.some((a) => a.id === parent!.id)) {
    ancestors.unshift(parent);
    parent = folders.data?.find((f) => f.id === parent?.parent_folder_id);
  }
  return (
    <>
      <PageHeader
        title="Файлы проекта"
        description="Материалы исследования в одном защищённом пространстве."
        action={
          canEdit(role) && (
            <>
              <Button onClick={() => setNewFolder(true)}>
                <FolderPlus size={17} />
                Новая папка
              </Button>
              <label className={`button primary ${busy ? "disabled" : ""}`}>
                <Upload size={17} />
                Загрузить файлы
                <input
                  aria-label="Загрузить файлы"
                  type="file"
                  multiple
                  hidden
                  disabled={!!busy}
                  accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.csv,.txt"
                  onChange={(e) => {
                    void upload(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </>
          )
        }
      />
      <div className="file-breadcrumb">
        <Button variant="ghost" onClick={() => setFolder(null)}>
          <Home size={16} />
          Все файлы
        </Button>
        {ancestors.map((f) => (
          <Button variant="ghost" key={f.id} onClick={() => setFolder(f.id)}>
            / {f.name}
          </Button>
        ))}
      </div>
      {busy && (
        <div className="upload-progress" role="status">
          <progress />
          {busy}
        </div>
      )}
      {files.isLoading || folders.isLoading ? (
        <Skeleton />
      ) : files.error ? (
        <ErrorState error={files.error} />
      ) : (
        <div className="files-grid">
          {folder && (
            <button
              className="card file-card"
              onClick={() => setFolder(current?.parent_folder_id ?? null)}
            >
              <ArrowLeft />
              <strong>На уровень выше</strong>
            </button>
          )}
          {folders.data
            ?.filter((f) => f.parent_folder_id === folder)
            .map((f) => (
              <button
                className="card file-card folder-card"
                key={f.id}
                onClick={() => setFolder(f.id)}
              >
                <FolderIcon size={32} />
                <strong>{f.name}</strong>
                <small>
                  {files.data?.filter((file) => file.folder_id === f.id)
                    .length ?? 0}{" "}
                  файлов
                </small>
              </button>
            ))}
          {files.data
            ?.filter((f) => f.folder_id === folder)
            .map((f) => (
              <article className="card file-card" key={f.id}>
                <div className="file-card-top">
                  {f.mime_type.startsWith("image/") ? (
                    <ImageIcon size={28} />
                  ) : (
                    <FileText size={28} />
                  )}
                  <Button
                    variant="ghost"
                    aria-label={`Действия с ${f.original_name}`}
                    onClick={() => {
                      setActive(f);
                      setPreview("");
                      setEdit(false);
                    }}
                  >
                    <MoreHorizontal size={18} />
                  </Button>
                </div>
                <button
                  className="file-name"
                  onClick={() => {
                    setActive(f);
                    setPreview("");
                    setEdit(false);
                  }}
                >
                  {f.original_name}
                </button>
                <small>
                  {(f.size_bytes / 1024).toFixed(1)} КБ · {date(f.created_at)}
                </small>
                <Button
                  variant="ghost"
                  disabled={!!busy}
                  onClick={() => void downloadFile(f)}
                >
                  <Download size={15} />
                  Скачать
                </Button>
              </article>
            ))}
        </div>
      )}
      {!files.isLoading &&
        !files.data?.some((f) => f.folder_id === folder) &&
        !folders.data?.some((f) => f.parent_folder_id === folder) && (
          <div className="card">
            <Empty
              title="Место для ваших материалов"
              text="PDF, документы, таблицы и изображения. Максимальный размер файла — 10 МБ."
            />
          </div>
        )}
      <Modal open={newFolder} onOpenChange={setNewFolder} title="Новая папка">
        <DataForm
          fields={[{ name: "name", label: "Название", required: true }]}
          onSave={async (v) => {
            await insert("project_folders", {
              project_id: project.id,
              parent_folder_id: folder,
              name: v.name,
            });
            await refresh();
            setNewFolder(false);
          }}
        />
      </Modal>
      <Modal
        open={!!active}
        onOpenChange={(v) => {
          if (!v) {
            setActive(null);
            setPreview("");
            setEdit(false);
          }
        }}
        title={active?.original_name ?? "Файл"}
      >
        {active && (
          <>
            <p className="muted">
              {(active.size_bytes / 1024).toFixed(1)} КБ ·{" "}
              {date(active.created_at)}
            </p>
            <div className="row-actions">
              <Button
                onClick={() => void downloadFile(active)}
                disabled={!!busy}
              >
                <Download size={16} />
                Скачать
              </Button>
              <Button
                onClick={async () => {
                  await navigator.clipboard.writeText(
                    appUrl(`/projects/${project.id}/files?file=${active.id}`),
                  );
                  toast.success(
                    "Ссылка скопирована. Для открытия нужен доступ к проекту.",
                  );
                }}
              >
                Копировать ссылку
              </Button>
              {(active.mime_type === "application/pdf" ||
                active.mime_type.startsWith("image/")) && (
                <Button
                  onClick={async () => {
                    const { data, error } = await db()
                      .storage.from(bucket)
                      .createSignedUrl(active.storage_path, 60);
                    if (error) toast.error("Нет доступа к файлу");
                    else setPreview(data.signedUrl);
                  }}
                >
                  Предпросмотр (60 сек.)
                </Button>
              )}
              {canEdit(role) && (
                <>
                  <Button onClick={() => setEdit(!edit)}>
                    Переименовать / переместить
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setDeleting(active);
                      setActive(null);
                    }}
                  >
                    Удалить
                  </Button>
                </>
              )}
            </div>
            {preview &&
              (active.mime_type.startsWith("image/") ? (
                <img
                  className="file-preview-image"
                  src={preview}
                  alt={active.original_name}
                />
              ) : (
                <iframe
                  className="pdf-preview"
                  src={preview}
                  title={active.original_name}
                />
              ))}
            {edit && (
              <DataForm
                initial={{
                  original_name: active.original_name,
                  folder_id: active.folder_id ?? "",
                }}
                fields={[
                  {
                    name: "original_name",
                    label: "Имя",
                    required: true,
                    maxLength: 255,
                  },
                  {
                    name: "folder_id",
                    label: "Папка",
                    type: "select",
                    options: [
                      { value: "", label: "Все файлы" },
                      ...(folders.data ?? []).map((f) => ({
                        value: f.id,
                        label: f.name,
                      })),
                    ],
                  },
                ]}
                onSave={async (v) => {
                  await update(
                    "project_files",
                    active.id,
                    {
                      original_name: v.original_name,
                      folder_id: v.folder_id || null,
                    },
                    active.version,
                  );
                  await refresh();
                  setActive(null);
                }}
              />
            )}
          </>
        )}
      </Modal>
      <Confirm
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Удалить файл?"
        text="Объект будет удалён из приватного хранилища и списка материалов."
        onConfirm={async () => {
          const f = deleting!;
          const { error } = await db()
            .storage.from(bucket)
            .remove([f.storage_path]);
          if (error) throw error;
          await remove("project_files", f.id);
          await refresh();
        }}
      />
    </>
  );
}
