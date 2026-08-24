"use client";
/* eslint-disable @next/next/no-img-element -- media is streamed from authenticated Drive proxy URLs */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DriveMedia, PublicConnection } from "@/types/drive";

type ApiResult<T> = { data: T; error: { message: string } | null };
type GalleryData = { items: DriveMedia[]; pagination: { page: number; limit: number; total: number; totalPages: number }; connectionErrors: Array<{ connectionName: string; message: string }> };
type UploadItem = { id: string; file: File; progress: number; status: "queued" | "uploading" | "done" | "error"; error?: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init); const body = response.status === 204 ? null : await response.json() as ApiResult<T>;
  if (!response.ok) throw new Error(body?.error?.message || `Request failed (${response.status})`);
  return body?.data as T;
}

function formatBytes(value: number) {
  if (!value) return "0 B"; const units = ["B", "KB", "MB", "GB", "TB"]; const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export default function Dashboard() {
  const [connections, setConnections] = useState<PublicConnection[]>([]); const [gallery, setGallery] = useState<GalleryData>({ items: [], pagination: { page: 1, limit: 24, total: 0, totalPages: 1 }, connectionErrors: [] });
  const [loading, setLoading] = useState(true); const [message, setMessage] = useState(""); const [showConnect, setShowConnect] = useState(false); const [showUpload, setShowUpload] = useState(false);
  const [filters, setFilters] = useState({ search: "", type: "", mime: "", from: "", to: "", sortBy: "createdTime", sortOrder: "desc" }); const [page, setPage] = useState(1);
  const [connectionName, setConnectionName] = useState(""); const [folder, setFolder] = useState(""); const [connecting, setConnecting] = useState(false);
  const [uploadConnection, setUploadConnection] = useState(""); const [uploads, setUploads] = useState<UploadItem[]>([]); const fileInput = useRef<HTMLInputElement>(null);

  const loadConnections = useCallback(async () => { const items = await api<PublicConnection[]>("/api/connections"); setConnections(items); setUploadConnection((current) => current || items[0]?.id || ""); }, []);
  const query = useMemo(() => { const params = new URLSearchParams({ page: String(page), limit: "24", sortBy: filters.sortBy, sortOrder: filters.sortOrder }); Object.entries(filters).forEach(([key, value]) => { if (value && key !== "sortBy" && key !== "sortOrder") params.set(key, key === "from" ? new Date(`${value}T00:00:00`).toISOString() : key === "to" ? new Date(`${value}T23:59:59.999`).toISOString() : value); }); return params.toString(); }, [filters, page]);
  const loadGallery = useCallback(async () => { setLoading(true); try { setGallery(await api<GalleryData>(`/api/media?${query}`)); } catch (error) { setMessage((error as Error).message); } finally { setLoading(false); } }, [query]);

  useEffect(() => { loadConnections().catch((error) => setMessage(error.message)); }, [loadConnections]);
  useEffect(() => { const timer = setTimeout(() => loadGallery(), 250); return () => clearTimeout(timer); }, [loadGallery]);
  useEffect(() => { const params = new URLSearchParams(location.search); if (params.get("connected")) setMessage("Đã kết nối Google Drive thành công."); if (params.get("error")) setMessage(params.get("error") || "Kết nối thất bại"); if (params.size) history.replaceState({}, "", "/"); }, []);

  async function connect(event: React.FormEvent) { event.preventDefault(); setConnecting(true); try { const result = await api<{ authorizationUrl: string }>("/api/connections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: connectionName, folder }) }); location.href = result.authorizationUrl; } catch (error) { setMessage((error as Error).message); setConnecting(false); } }
  async function removeConnection(connection: PublicConnection) { if (!confirm(`Xóa vĩnh viễn folder “${connection.folderName}” cùng TOÀN BỘ nội dung và gỡ connection “${connection.name}”?`)) return; try { await api(`/api/connections/${connection.id}`, { method: "DELETE" }); setMessage("Đã xóa folder và gỡ connection."); await Promise.all([loadConnections(), loadGallery()]); } catch (error) { setMessage((error as Error).message); } }
  async function removeMedia(item: DriveMedia) { if (!confirm(`Xóa vĩnh viễn “${item.name}”? Thao tác này không thể hoàn tác.`)) return; try { await api(`/api/media/${item.connectionId}/${item.id}`, { method: "DELETE" }); await loadGallery(); } catch (error) { setMessage((error as Error).message); } }

  function addFiles(files: FileList | File[]) { const valid = Array.from(files).filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/")); setUploads((current) => [...current, ...valid.map((file) => ({ id: crypto.randomUUID(), file, progress: 0, status: "queued" as const }))]); if (valid.length !== files.length) setMessage("Một số file đã bị bỏ qua vì không phải ảnh hoặc video."); }
  function patchUpload(id: string, patch: Partial<UploadItem>) { setUploads((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item)); }
  async function uploadOne(item: UploadItem) {
    patchUpload(item.id, { status: "uploading", error: undefined });
    try {
      const started = await api<{ session: string; chunkSize: number }>("/api/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ connectionId: uploadConnection, name: item.file.name, mimeType: item.file.type, size: item.file.size }) });
      if (item.file.size === 0) throw new Error("File rỗng không thể upload");
      let offset = 0;
      while (offset < item.file.size) {
        const end = Math.min(offset + started.chunkSize, item.file.size);
        try {
          const response = await fetch(`/api/uploads?session=${encodeURIComponent(started.session)}`, { method: "PUT", headers: { "content-type": item.file.type, "content-range": `bytes ${offset}-${end - 1}/${item.file.size}` }, body: item.file.slice(offset, end) });
          const result = await response.json() as ApiResult<{ range?: string }>; if (!response.ok) throw new Error(result.error?.message || "Upload chunk thất bại");
          offset = end;
        } catch (chunkError) {
          const statusResponse = await fetch(`/api/uploads?session=${encodeURIComponent(started.session)}`, { method: "PUT", headers: { "content-type": item.file.type, "content-range": `bytes */${item.file.size}` }, body: new Blob() });
          if (!statusResponse.ok) throw chunkError;
          const status = await statusResponse.json() as ApiResult<{ range?: string }>;
          const received = status.data?.range?.match(/bytes=0-(\d+)/)?.[1];
          offset = received ? Number(received) + 1 : 0;
        }
        patchUpload(item.id, { progress: Math.round(offset / item.file.size * 100) });
      }
      patchUpload(item.id, { status: "done", progress: 100 });
    } catch (error) { patchUpload(item.id, { status: "error", error: (error as Error).message }); }
  }
  async function startUploads() { if (!uploadConnection) return setMessage("Hãy chọn một Google Drive."); const queue = uploads.filter((item) => item.status === "queued" || item.status === "error"); let cursor = 0; await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => { while (cursor < queue.length) { const item = queue[cursor++]; await uploadOne(item); } })); await loadGallery(); }

  return <main className="min-h-screen bg-slate-950 text-slate-100">
    <header className="border-b border-white/10 bg-slate-950/90 px-5 py-4 backdrop-blur"><div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4"><div><h1 className="text-xl font-semibold tracking-tight">Driver Bridge</h1><p className="text-xs text-slate-400">Google Drive media workspace</p></div><div className="flex gap-2"><button className="btn-secondary" onClick={() => setShowConnect(true)}>+ Kết nối Drive</button><button className="btn-primary" disabled={!connections.length} onClick={() => setShowUpload(true)}>↑ Upload media</button></div></div></header>
    <div className="mx-auto grid max-w-[1500px] gap-6 px-5 py-6 lg:grid-cols-[270px_1fr]">
      <aside><section className="panel"><div className="mb-4 flex items-center justify-between"><h2 className="font-medium">Connections</h2><span className="badge">{connections.length}</span></div><div className="space-y-2">{connections.map((item) => <div className="rounded-xl border border-white/10 bg-white/[.03] p-3" key={item.id}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.name}</p><p className="truncate text-xs text-slate-400">{item.email}</p></div><button title="Gỡ connection" className="icon-danger" onClick={() => removeConnection(item)}>×</button></div><p className="mt-2 truncate text-xs text-slate-500">▣ {item.folderName}</p></div>)}{!connections.length && <p className="py-8 text-center text-sm text-slate-500">Chưa có Google Drive</p>}</div></section></aside>
      <section className="min-w-0"><div className="panel mb-5"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><input className="field xl:col-span-2" placeholder="Tìm theo tên…" value={filters.search} onChange={(e) => { setPage(1); setFilters({ ...filters, search: e.target.value }); }} /><select className="field" value={filters.type} onChange={(e) => { setPage(1); setFilters({ ...filters, type: e.target.value }); }}><option value="">Ảnh + video</option><option value="image">Chỉ ảnh</option><option value="video">Chỉ video</option></select><input className="field" placeholder="MIME, ví dụ image/png" value={filters.mime} onChange={(e) => { setPage(1); setFilters({ ...filters, mime: e.target.value }); }} /><input className="field" type="date" value={filters.from} onChange={(e) => { setPage(1); setFilters({ ...filters, from: e.target.value }); }} /><input className="field" type="date" value={filters.to} onChange={(e) => { setPage(1); setFilters({ ...filters, to: e.target.value }); }} /><select className="field" value={filters.sortBy} onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}><option value="createdTime">Ngày tạo</option><option value="modifiedTime">Ngày sửa</option><option value="name">Tên</option><option value="size">Dung lượng</option></select><select className="field" value={filters.sortOrder} onChange={(e) => setFilters({ ...filters, sortOrder: e.target.value })}><option value="desc">Giảm dần</option><option value="asc">Tăng dần</option></select></div></div>
        {message && <div className="mb-5 flex items-center justify-between rounded-xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-100"><span>{message}</span><button onClick={() => setMessage("")}>×</button></div>}
        {gallery.connectionErrors.length > 0 && <div className="mb-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">{gallery.connectionErrors.map((item) => <p key={item.connectionName}>{item.connectionName}: {item.message}</p>)}</div>}
        <div className="mb-4 flex items-end justify-between"><div><h2 className="text-lg font-semibold">Media library</h2><p className="text-sm text-slate-400">{gallery.pagination.total} file trên {connections.length} connection</p></div></div>
        {loading ? <div className="empty">Đang tải media…</div> : gallery.items.length === 0 ? <div className="empty"><span className="text-4xl">◇</span><p className="mt-3">Không tìm thấy media</p><p className="text-sm text-slate-500">Kết nối Drive hoặc upload file đầu tiên.</p></div> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{gallery.items.map((item) => { const src = `/api/media/${item.connectionId}/${item.id}`; return <article key={`${item.connectionId}-${item.id}`} className="group overflow-hidden rounded-2xl border border-white/10 bg-slate-900"><div className="aspect-[4/3] overflow-hidden bg-black/30">{item.mimeType.startsWith("video/") ? <video className="h-full w-full object-cover" src={src} controls preload="metadata" /> : <img className="h-full w-full object-cover transition group-hover:scale-[1.02]" src={src} alt={item.name} loading="lazy" />}</div><div className="p-3"><p className="truncate text-sm font-medium" title={item.name}>{item.name}</p><div className="mt-1 flex justify-between text-xs text-slate-500"><span className="truncate">{item.connectionName}</span><span>{formatBytes(item.size)}</span></div><div className="mt-3 flex gap-2"><a className="btn-mini" href={`${src}?download=1`}>Tải xuống</a><button className="btn-mini-danger" onClick={() => removeMedia(item)}>Xóa</button></div></div></article>; })}</div>}
        {gallery.pagination.totalPages > 1 && <div className="mt-6 flex items-center justify-center gap-3"><button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Trước</button><span className="text-sm text-slate-400">Trang {page} / {gallery.pagination.totalPages}</span><button className="btn-secondary" disabled={page >= gallery.pagination.totalPages} onClick={() => setPage(page + 1)}>Sau →</button></div>}
      </section>
    </div>
    {showConnect && <div className="modal"><form className="modal-card" onSubmit={connect}><div className="mb-5 flex justify-between"><div><h2 className="text-lg font-semibold">Kết nối Google Drive</h2><p className="text-sm text-slate-400">Folder phải nằm trong My Drive và có quyền xóa.</p></div><button type="button" onClick={() => setShowConnect(false)}>×</button></div><label className="label">Tên connection<input className="field mt-2" required maxLength={80} value={connectionName} onChange={(e) => setConnectionName(e.target.value)} placeholder="Drive Marketing" /></label><label className="label mt-4">URL hoặc ID folder<input className="field mt-2" required value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" /></label><div className="mt-6 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setShowConnect(false)}>Hủy</button><button className="btn-primary" disabled={connecting}>{connecting ? "Đang chuyển hướng…" : "Đăng nhập Google"}</button></div></form></div>}
    {showUpload && <div className="modal"><div className="modal-card max-w-2xl"><div className="mb-5 flex justify-between"><div><h2 className="text-lg font-semibold">Upload media</h2><p className="text-sm text-slate-400">Tối đa 3 file đồng thời, không giới hạn kích thước.</p></div><button onClick={() => setShowUpload(false)}>×</button></div><select className="field mb-4" value={uploadConnection} onChange={(e) => setUploadConnection(e.target.value)}>{connections.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.folderName}</option>)}</select><div className="cursor-pointer rounded-2xl border-2 border-dashed border-white/15 p-8 text-center hover:border-sky-400/50" onClick={() => fileInput.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}><input ref={fileInput} className="hidden" type="file" accept="image/*,video/*" multiple onChange={(e) => e.target.files && addFiles(e.target.files)} /><p className="text-2xl">↑</p><p className="mt-2 text-sm">Kéo thả hoặc chọn ảnh/video</p></div><div className="mt-4 max-h-64 space-y-2 overflow-auto">{uploads.map((item) => <div key={item.id} className="rounded-xl bg-white/5 p-3"><div className="flex justify-between gap-3 text-sm"><span className="truncate">{item.file.name}</span><span className={item.status === "error" ? "text-red-400" : "text-slate-400"}>{item.status === "error" ? item.error : `${item.progress}%`}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded bg-white/10"><div className={`h-full ${item.status === "error" ? "bg-red-500" : item.status === "done" ? "bg-emerald-500" : "bg-sky-500"}`} style={{ width: `${item.progress}%` }} /></div></div>)}</div><div className="mt-6 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setShowUpload(false)}>Đóng</button><button className="btn-primary" disabled={!uploads.some((item) => item.status === "queued" || item.status === "error")} onClick={startUploads}>Bắt đầu upload</button></div></div></div>}
  </main>;
}
