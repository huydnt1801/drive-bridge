"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DriveMedia, PublicConnection } from "@/types/drive";
import type { TaskItem, TaskPriority, TaskStatus } from "@/types/task";

type ApiResult<T> = { data: T; error: { code: string; message: string } | null };
class ApiError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message);
  }
}
type GalleryData = {
  items: DriveMedia[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  connectionErrors: Array<{ connectionName: string; message: string }>;
};
type UploadItem = {
  id: string;
  file: File;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};
type Layout = "grid" | "focus" | "strip";
const mediaMimeByExtension: Record<string, string> = {
  avif: "image/avif",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  mov: "video/quicktime",
  mp4: "video/mp4",
  png: "image/png",
  webm: "video/webm",
  webp: "image/webp",
};

function mediaMimeType(file: File) {
  if (file.type.startsWith("image/") || file.type.startsWith("video/")) return file.type;
  return mediaMimeByExtension[file.name.split(".").pop()?.toLowerCase() || ""] || "";
}
const taskPriorityLabel: Record<TaskPriority, string> = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
};
const taskPriorityOrder: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = response.status === 204 ? null : ((await response.json()) as ApiResult<T>);
  if (!response.ok)
    throw new ApiError(
      body?.error?.message || `Request failed (${response.status})`,
      body?.error?.code
    );
  return body?.data as T;
}

function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden="true" className="text-base leading-none">
      {children}
    </span>
  );
}

export default function Dashboard() {
  const [connections, setConnections] = useState<PublicConnection[]>([]);
  const [gallery, setGallery] = useState<GalleryData>({
    items: [],
    pagination: { page: 1, limit: 24, total: 0, totalPages: 1 },
    connectionErrors: [],
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [showConnect, setShowConnect] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showStudio, setShowStudio] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState("");
  const [editingTaskPriority, setEditingTaskPriority] = useState<TaskPriority>("medium");
  const [taskTab, setTaskTab] = useState<TaskStatus>("todo");
  const [selected, setSelected] = useState<DriveMedia[]>([]);
  const [layout, setLayout] = useState<Layout>("grid");
  const [filters, setFilters] = useState({
    search: "",
    type: "",
    mime: "",
    from: "",
    to: "",
    sortBy: "createdTime",
    sortOrder: "desc",
  });
  const [page, setPage] = useState(1);
  const [connectionName, setConnectionName] = useState("");
  const [folder, setFolder] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [uploadConnection, setUploadConnection] = useState("");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadConnections = useCallback(async () => {
    const items = await api<PublicConnection[]>("/api/connections");
    setConnections(items);
    setUploadConnection((current) => current || items[0]?.id || "");
  }, []);
  const loadTasks = useCallback(async () => {
    try {
      setTasks(await api<TaskItem[]>("/api/tasks"));
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setTasksLoaded(true);
    }
  }, []);
  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: "24",
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    });
    Object.entries(filters).forEach(([key, value]) => {
      if (value && key !== "sortBy" && key !== "sortOrder")
        params.set(
          key,
          key === "from"
            ? new Date(`${value}T00:00:00`).toISOString()
            : key === "to"
              ? new Date(`${value}T23:59:59.999`).toISOString()
              : value
        );
    });
    return params.toString();
  }, [filters, page]);
  const loadGallery = useCallback(async () => {
    setLoading(true);
    try {
      setGallery(await api<GalleryData>(`/api/media?${query}`));
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [query]);
  useEffect(() => {
    loadConnections().catch((error) => setMessage(error.message));
  }, [loadConnections]);
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);
  useEffect(() => {
    const timer = setTimeout(() => loadGallery(), 250);
    return () => clearTimeout(timer);
  }, [loadGallery]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("connected")) setMessage("Đã kết nối Google Drive thành công.");
    if (params.get("error")) setMessage(params.get("error") || "Kết nối thất bại");
    if (params.size) history.replaceState({}, "", "/");
  }, []);
  async function addTask(event: React.FormEvent) {
    event.preventDefault();
    const title = taskTitle.trim();
    if (!title) return;
    try {
      const task = await api<TaskItem>("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, priority: taskPriority }),
      });
      setTasks((items) => [task, ...items]);
      setTaskTitle("");
      setTaskPriority("medium");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function updateTaskStatus(id: string, status: TaskStatus) {
    try {
      const task = await api<TaskItem>(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setTasks((items) => items.map((item) => (item.id === id ? task : item)));
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function saveTask(id: string) {
    const title = editingTaskTitle.trim();
    try {
      if (title) {
        const task = await api<TaskItem>(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, priority: editingTaskPriority }),
        });
        setTasks((items) => items.map((item) => (item.id === id ? task : item)));
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setEditingTaskId(null);
      setEditingTaskTitle("");
    }
  }
  function editTask(task: TaskItem) {
    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
    setEditingTaskPriority(task.priority);
  }
  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => taskPriorityOrder[a.priority] - taskPriorityOrder[b.priority]),
    [tasks]
  );
  const visibleTasks = sortedTasks.filter((task) => task.status === taskTab);
  async function removeTask(id: string) {
    try {
      await api(`/api/tasks/${id}`, { method: "DELETE" });
      setTasks((items) => items.filter((item) => item.id !== id));
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    setConnecting(true);
    try {
      const result = await api<{ authorizationUrl: string }>("/api/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: connectionName, folder }),
      });
      location.href = result.authorizationUrl;
    } catch (error) {
      setMessage((error as Error).message);
      setConnecting(false);
    }
  }
  async function reconnect(item: PublicConnection) {
    try {
      const result = await api<{ authorizationUrl: string }>("/api/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: item.name, folder: item.folderId, connectionId: item.id }),
      });
      location.href = result.authorizationUrl;
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function removeConnection(item: PublicConnection) {
    if (!confirm(`Xóa folder “${item.folderName}” cùng toàn bộ nội dung?`)) return;
    try {
      await api(`/api/connections/${item.id}`, { method: "DELETE" });
      await Promise.all([loadConnections(), loadGallery()]);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function removeMedia(item: DriveMedia) {
    if (!confirm(`Xóa vĩnh viễn “${item.name}”?`)) return;
    try {
      await api(`/api/media/${item.connectionId}/${item.id}`, { method: "DELETE" });
      setSelected((items) => items.filter((selectedItem) => selectedItem.id !== item.id));
      await loadGallery();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  function toggleSelected(item: DriveMedia) {
    setSelected((items) =>
      items.some((selectedItem) => selectedItem.id === item.id)
        ? items.filter((selectedItem) => selectedItem.id !== item.id)
        : [...items, item]
    );
  }
  function addFiles(files: FileList | File[]) {
    const valid = Array.from(files).filter((file) => mediaMimeType(file));
    setUploads((items) => [
      ...items,
      ...valid.map((file) => ({
        id: crypto.randomUUID(),
        file,
        progress: 0,
        status: "queued" as const,
      })),
    ]);
    if (valid.length !== files.length)
      setMessage("Một số file không phải ảnh hoặc video đã được bỏ qua.");
  }
  function patchUpload(id: string, patch: Partial<UploadItem>) {
    setUploads((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }
  async function uploadOne(item: UploadItem) {
    patchUpload(item.id, { status: "uploading", error: undefined });
    try {
      const started = await api<{ session: string; chunkSize: number }>("/api/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          connectionId: uploadConnection,
          name: item.file.name,
          mimeType: mediaMimeType(item.file),
          size: item.file.size,
        }),
      });
      let offset = 0;
      while (offset < item.file.size) {
        const end = Math.min(offset + started.chunkSize, item.file.size);
        await api(`/api/uploads?session=${encodeURIComponent(started.session)}`, {
          method: "PUT",
          headers: {
            "content-type": mediaMimeType(item.file),
            "content-range": `bytes ${offset}-${end - 1}/${item.file.size}`,
          },
          body: item.file.slice(offset, end),
        });
        offset = end;
        patchUpload(item.id, { progress: Math.round((offset / item.file.size) * 100) });
      }
      patchUpload(item.id, { status: "done", progress: 100 });
    } catch (error) {
      const uploadError = error as ApiError;
      patchUpload(item.id, { status: "error", error: uploadError.message });
      if (uploadError.code === "GOOGLE_RECONNECT_REQUIRED") setMessage(uploadError.message);
    }
  }
  async function startUploads() {
    if (!uploadConnection) return setMessage("Hãy chọn một Google Drive.");
    const queue = uploads.filter((item) => item.status === "queued" || item.status === "error");
    await Promise.all(queue.map(uploadOne));
    await loadGallery();
  }

  function exportStudio() {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#f4f8fb";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cols = layout === "grid" ? 2 : 1;
    selected.slice(0, layout === "focus" ? 1 : 4).forEach((item, index) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = `/api/media/${item.connectionId}/${item.id}`;
      image.onload = () => {
        const w = layout === "strip" ? 1200 / Math.min(selected.length, 4) : 600;
        const h = layout === "focus" ? 800 : layout === "strip" ? 800 : 400;
        const x = layout === "strip" ? index * w : (index % cols) * w;
        const y = layout === "strip" ? 0 : Math.floor(index / cols) * h;
        ctx.drawImage(image, x, y, w, h);
        if (index === Math.min(selected.length, layout === "focus" ? 1 : 4) - 1) {
          const link = document.createElement("a");
          link.download = "nha-ky-niem-huy-linh.png";
          link.href = canvas.toDataURL("image/png");
          link.click();
        }
      };
    });
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="brand-mark">
              <img src="/brand/nha-ky-niem-huy-linh.png" alt="Biểu tượng Nhà Kỷ Niệm" />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-semibold tracking-tight">Nhà Kỷ Niệm</h1>
              <p className="text-xs text-muted-foreground">của Huy &amp; Linh</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => setShowConnect(true)}>
              <Icon>＋</Icon> Kết nối Drive
            </button>
            <button
              className="btn-primary"
              disabled={!connections.length}
              onClick={() => setShowUpload(true)}
            >
              <Icon>↑</Icon> Upload media
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1500px] gap-6 px-5 py-6 lg:grid-cols-[245px_1fr]">
        <aside className="flex flex-col gap-4">
          <nav className="panel">
            <p className="eyebrow">góc kỷ niệm</p>
            <button className="nav-active">
              <Icon>▦</Icon> Tất cả media <span>{gallery.pagination.total}</span>
            </button>
            <button className="nav-item" onClick={() => setShowStudio(true)}>
              <Icon>✧</Icon> Studio <span>{selected.length}</span>
            </button>
            <button className="nav-item" onClick={() => setShowTasks(true)}>
              <Icon>✓</Icon> Công việc{" "}
              <span>{tasks.filter((task) => task.status !== "done").length}</span>
            </button>
          </nav>
          <section className="panel">
            <div className="mb-4 flex items-center justify-between">
              <p className="eyebrow">folders</p>
              <span className="badge">{connections.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {connections.map((item) => (
                <div className="folder-row" key={item.id}>
                  <span className="folder-icon">▰</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.folderName}</p>
                  </div>
                  <button
                    title="Kết nối lại Google Drive"
                    className="icon-reconnect"
                    onClick={() => reconnect(item)}
                  >
                    ↻
                  </button>
                  <button
                    title="Gỡ folder"
                    className="icon-danger"
                    onClick={() => removeConnection(item)}
                  >
                    ×
                  </button>
                </div>
              ))}
              {!connections.length && (
                <p className="py-6 text-center text-sm text-muted-foreground">Chưa có folder</p>
              )}
            </div>
          </section>
          <div className="mt-auto rounded-2xl bg-primary p-4 text-primary-foreground">
            <p className="text-sm font-medium">Mẹo nhỏ</p>
            <p className="mt-1 text-xs leading-5 opacity-80">
              Chọn nhiều ảnh để mở nhanh trong Studio và tạo layout riêng.
            </p>
          </div>
        </aside>
        <section className="min-w-0">
          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="eyebrow">huy &amp; linh / tất cả kỷ niệm</p>
              <h2 className="font-serif text-4xl font-semibold tracking-tight">
                Chuyện của chúng mình
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {gallery.pagination.total} khoảnh khắc
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn-secondary"
                disabled={!selected.length}
                onClick={() => setShowStudio(true)}
              >
                ✧ Mở Studio ({selected.length})
              </button>
            </div>
          </div>
          <div className="panel mb-5">
            <div className="grid gap-3 md:grid-cols-[1fr_150px_150px]">
              <input
                className="field"
                placeholder="Tìm theo tên ảnh..."
                value={filters.search}
                onChange={(e) => {
                  setPage(1);
                  setFilters({ ...filters, search: e.target.value });
                }}
              />
              <select
                className="field filter-select"
                value={filters.type}
                onChange={(e) => {
                  setPage(1);
                  setFilters({ ...filters, type: e.target.value });
                }}
              >
                <option value="">Tất cả media</option>
                <option value="image">Chỉ hình ảnh</option>
                <option value="video">Chỉ video</option>
              </select>
              <select
                className="field filter-select"
                value={filters.sortBy}
                onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
              >
                <option value="createdTime">Mới nhất</option>
                <option value="name">Tên A-Z</option>
                <option value="size">Dung lượng</option>
              </select>
            </div>
          </div>
          {message && (
            <div className="mb-5 flex items-center justify-between rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm">
              <span>{message}</span>
              <button onClick={() => setMessage("")}>×</button>
            </div>
          )}
          {gallery.connectionErrors.map((item) => (
            <div
              key={item.connectionName}
              className="mb-4 rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm"
            >
              {item.connectionName}: {item.message}
            </div>
          ))}
          {loading ? (
            <div className="empty">Đang tải media...</div>
          ) : gallery.items.length === 0 ? (
            <div className="empty">
              <span className="text-4xl">◇</span>
              <p className="mt-3">Thư viện đang trống</p>
              <p className="text-sm text-muted-foreground">
                Kết nối Drive hoặc upload file đầu tiên.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {gallery.items.map((item) => {
                const src = `/api/media/${item.connectionId}/${item.id}`;
                const isSelected = selected.some((selectedItem) => selectedItem.id === item.id);
                return (
                  <article
                    key={`${item.connectionId}-${item.id}`}
                    className={`media-card ${isSelected ? "media-selected" : ""}`}
                  >
                    <div className="media-thumb" onClick={() => toggleSelected(item)}>
                      {item.mimeType.startsWith("video/") ? (
                        <video
                          className="h-full w-full object-cover"
                          src={src}
                          preload="metadata"
                        />
                      ) : (
                        <img
                          className="h-full w-full object-cover"
                          src={src}
                          alt={item.name}
                          loading="lazy"
                        />
                      )}
                      <button
                        aria-label={isSelected ? "Bỏ chọn ảnh" : "Chọn ảnh"}
                        className={`select-dot ${isSelected ? "selected" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelected(item);
                        }}
                      >
                        {isSelected ? "✓" : ""}
                      </button>
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-medium" title={item.name}>
                        {item.name}
                      </p>
                      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                        <span className="truncate">{item.connectionName}</span>
                        <span>{formatBytes(item.size)}</span>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <a className="btn-mini" href={`${src}?download=1`}>
                          Tải xuống
                        </a>
                        <button className="btn-mini-danger" onClick={() => removeMedia(item)}>
                          Xóa
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {gallery.pagination.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                className="btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                ← Trước
              </button>
              <span className="text-sm text-muted-foreground">
                Trang {page} / {gallery.pagination.totalPages}
              </span>
              <button
                className="btn-secondary"
                disabled={page >= gallery.pagination.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Sau →
              </button>
            </div>
          )}
        </section>
      </div>
      {showTasks && (
        <div className="modal" onMouseDown={() => setShowTasks(false)}>
          <div className="modal-card tasks-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">công việc</p>
                <h2 className="font-serif text-3xl font-semibold">Việc muốn làm</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {tasks.filter((task) => task.status === "done").length}/{tasks.length} việc đã
                  hoàn thành
                </p>
              </div>
              <button aria-label="Đóng danh sách công việc" onClick={() => setShowTasks(false)}>
                ×
              </button>
            </div>
            <div className="task-tabs">
              <button
                className={taskTab === "todo" ? "active" : ""}
                onClick={() => setTaskTab("todo")}
              >
                Chưa hoàn thành ({tasks.filter((task) => task.status !== "done").length})
              </button>
              <button
                className={taskTab === "done" ? "active" : ""}
                onClick={() => setTaskTab("done")}
              >
                Đã hoàn thành ({tasks.filter((task) => task.status === "done").length})
              </button>
            </div>
            {taskTab === "todo" && (
              <form className="task-create" onSubmit={addTask}>
                <input
                  className="field"
                  value={taskTitle}
                  maxLength={160}
                  onChange={(event) => setTaskTitle(event.target.value)}
                  placeholder="Nhập một việc muốn làm..."
                  autoFocus
                />
                <select
                  className={`field task-priority-select priority-${taskPriority}`}
                  aria-label="Chọn mức ưu tiên"
                  value={taskPriority}
                  onChange={(event) => setTaskPriority(event.target.value as TaskPriority)}
                >
                  {(Object.keys(taskPriorityLabel) as TaskPriority[]).map((priority) => (
                    <option key={priority} value={priority}>
                      {taskPriorityLabel[priority]}
                    </option>
                  ))}
                </select>
                <button className="btn-primary" disabled={!taskTitle.trim()}>
                  Thêm việc
                </button>
              </form>
            )}
            <div className="mt-5 flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
              {visibleTasks.map((task) => (
                <div
                  className={`task-row ${task.status === "done" ? "task-done" : ""}`}
                  key={task.id}
                  onClick={() => editTask(task)}
                >
                  <button
                    className="task-check"
                    type="button"
                    title={task.status === "done" ? "Đánh dấu chưa xong" : "Đánh dấu hoàn thành"}
                    onClick={(event) => {
                      event.stopPropagation();
                      updateTaskStatus(task.id, task.status === "done" ? "todo" : "done");
                    }}
                  >
                    {task.status === "done" ? "✓" : ""}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="task-title" title="Nhấn để sửa">
                      {task.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(
                        new Date(task.createdAt)
                      )}
                    </p>
                  </div>
                  <span className={`task-priority priority-${task.priority}`}>
                    {taskPriorityLabel[task.priority]}
                  </span>
                  <button
                    className="icon-danger"
                    type="button"
                    title="Xóa công việc"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeTask(task.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              {tasksLoaded && !visibleTasks.length && (
                <div className="empty min-h-48">
                  <span className="text-3xl">✓</span>
                  <p className="mt-2 text-sm">
                    {taskTab === "done"
                      ? "Chưa có việc nào hoàn thành."
                      : "Chưa có việc nào. Thêm việc đầu tiên nhé."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {editingTaskId && (
        <div className="modal z-[60]" onMouseDown={() => setEditingTaskId(null)}>
          <form
            className="modal-card"
            onSubmit={(event) => {
              event.preventDefault();
              saveTask(editingTaskId);
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">chỉnh sửa</p>
                <h2 className="font-serif text-2xl font-semibold">Sửa công việc</h2>
              </div>
              <button
                type="button"
                aria-label="Đóng chỉnh sửa"
                onClick={() => setEditingTaskId(null)}
              >
                ×
              </button>
            </div>
            <label className="label">
              Nội dung công việc
              <textarea
                className="field mt-2 min-h-28 resize-y"
                value={editingTaskTitle}
                maxLength={160}
                onChange={(event) => setEditingTaskTitle(event.target.value)}
                autoFocus
              />
            </label>
            <div className="mt-4">
              <p className="label">Mức ưu tiên</p>
              <div className="priority-picker mt-2">
                {(Object.keys(taskPriorityLabel) as TaskPriority[]).map((priority) => (
                  <button
                    type="button"
                    key={priority}
                    aria-pressed={editingTaskPriority === priority}
                    className={`task-priority priority-${priority} ${editingTaskPriority === priority ? "selected" : ""}`}
                    onClick={() => setEditingTaskPriority(priority)}
                  >
                    {taskPriorityLabel[priority]}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditingTaskId(null)}
              >
                Hủy
              </button>
              <button className="btn-primary" disabled={!editingTaskTitle.trim()}>
                Lưu thay đổi
              </button>
            </div>
          </form>
        </div>
      )}
      {showConnect && (
        <div className="modal" onMouseDown={() => setShowConnect(false)}>
          <form
            className="modal-card"
            onSubmit={connect}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">new connection</p>
                <h2 className="font-serif text-2xl font-semibold">Kết nối Google Drive</h2>
              </div>
              <button type="button" onClick={() => setShowConnect(false)}>
                ×
              </button>
            </div>
            <label className="label">
              Tên folder
              <input
                className="field mt-2"
                required
                maxLength={80}
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
                placeholder="Ví dụ: Editorial 2026"
              />
            </label>
            <label className="label mt-4">
              URL hoặc ID folder
              <input
                className="field mt-2"
                required
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowConnect(false)}>
                Hủy
              </button>
              <button className="btn-primary" disabled={connecting}>
                {connecting ? "Đang chuyển hướng..." : "Đăng nhập Google"}
              </button>
            </div>
          </form>
        </div>
      )}
      {showUpload && (
        <div className="modal" onMouseDown={() => setShowUpload(false)}>
          <div className="modal-card max-w-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">add to archive</p>
                <h2 className="font-serif text-2xl font-semibold">Upload media</h2>
              </div>
              <button onClick={() => setShowUpload(false)}>×</button>
            </div>
            <select
              className="field mb-4"
              value={uploadConnection}
              onChange={(e) => setUploadConnection(e.target.value)}
            >
              {connections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {item.folderName}
                </option>
              ))}
            </select>
            <div
              className="dropzone"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                addFiles(e.dataTransfer.files);
              }}
            >
              <input
                ref={fileInput}
                className="hidden"
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
              <p className="text-3xl">↑</p>
              <p className="mt-2 text-sm font-medium">Kéo thả hoặc chọn ảnh/video</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Upload trực tiếp vào folder Google Drive
              </p>
            </div>
            <div className="mt-4 flex max-h-56 flex-col gap-2 overflow-auto">
              {uploads.map((item) => (
                <div key={item.id} className="rounded-xl bg-muted p-3">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="truncate">{item.file.name}</span>
                    <span className="text-muted-foreground">
                      {item.status === "error" ? item.error : `${item.progress}%`}
                    </span>
                  </div>
                  <div className="progress mt-2">
                    <span style={{ width: `${item.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setShowUpload(false)}>
                Đóng
              </button>
              <button
                className="btn-primary"
                disabled={
                  !uploads.some((item) => item.status === "queued" || item.status === "error")
                }
                onClick={startUploads}
              >
                Bắt đầu upload
              </button>
            </div>
          </div>
        </div>
      )}
      {showStudio && (
        <div className="modal" onMouseDown={() => setShowStudio(false)}>
          <div className="modal-card studio-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">creative workspace</p>
                <h2 className="font-serif text-2xl font-semibold">Studio</h2>
                <p className="text-sm text-muted-foreground">
                  {selected.length} ảnh đang được chọn
                </p>
              </div>
              <button onClick={() => setShowStudio(false)}>×</button>
            </div>
            <div className="studio-preview">
              <div className={`canvas-layout layout-${layout}`}>
                {selected.slice(0, layout === "focus" ? 1 : 4).map((item) => (
                  <img
                    key={item.id}
                    src={`/api/media/${item.connectionId}/${item.id}`}
                    alt={item.name}
                  />
                ))}
                {!selected.length && <p>Hãy chọn ảnh từ thư viện để bắt đầu</p>}
              </div>
            </div>
            <div className="mt-5">
              <p className="eyebrow mb-2">choose a layout</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  className={`layout-choice ${layout === "grid" ? "active" : ""}`}
                  onClick={() => setLayout("grid")}
                >
                  <span className="layout-grid" />
                  Lưới 2 × 2
                </button>
                <button
                  className={`layout-choice ${layout === "focus" ? "active" : ""}`}
                  onClick={() => setLayout("focus")}
                >
                  <span className="layout-focus" />
                  Ảnh chủ đạo
                </button>
                <button
                  className={`layout-choice ${layout === "strip" ? "active" : ""}`}
                  onClick={() => setLayout("strip")}
                >
                  <span className="layout-strip" />
                  Dải ảnh
                </button>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setSelected([])}>
                Bỏ chọn
              </button>
              <button className="btn-primary" disabled={!selected.length} onClick={exportStudio}>
                Xuất ảnh PNG ↓
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
