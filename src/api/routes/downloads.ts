import { downloadService, DownloadType } from "../server";

interface RouteResult {
  status: number;
  data: Record<string, unknown>;
}

export async function handleDownloadRoute(
  method: string,
  path: string,
  url: URL,
  req: Request,
  userId: number | null,
): Promise<RouteResult | null> {
  if (!downloadService)
    return { status: 500, data: { error: "Service not initialized" } };

  if (method === "GET" && path === "/api/v1/downloads") {
    const tasks = downloadService.getActiveTasks();
    return { status: 200, data: { tasks } };
  }

  if (method === "POST" && path === "/api/v1/downloads") {
    if (!userId)
      return { status: 401, data: { error: "X-User-Id header required" } };
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const result = await downloadService.createDownload(userId, {
      url: body.url as string,
      filename: body.filename as string | undefined,
      category: body.category as string | undefined,
      type: body.type as DownloadType | undefined,
    });
    if ("error" in result) return { status: 400, data: result };
    return { status: 201, data: result };
  }

  const downloadMatch = path.match(/^\/api\/v1\/downloads\/([^/]+)(\/.*)?$/);
  if (downloadMatch) {
    const taskId = downloadMatch[1]!;
    const subPath = downloadMatch[2] || "";

    if (method === "GET" && !subPath) {
      const task = downloadService.getTaskById(taskId);
      if (!task) return { status: 404, data: { error: "Task not found" } };
      return { status: 200, data: task };
    }

    if (method === "DELETE" && !subPath) {
      const deleteFiles = url.searchParams.get("deleteFiles") === "true";
      const ok = await downloadService.deleteTask(taskId, deleteFiles);
      if (!ok) return { status: 404, data: { error: "Task not found" } };
      return { status: 200, data: { success: true } };
    }

    if (method === "POST" && subPath === "/pause") {
      const ok = await downloadService.pauseTask(taskId);
      if (!ok) return { status: 400, data: { error: "Could not pause" } };
      return { status: 200, data: { success: true } };
    }

    if (method === "POST" && subPath === "/resume") {
      const ok = await downloadService.resumeTask(taskId);
      if (!ok) return { status: 400, data: { error: "Could not resume" } };
      return { status: 200, data: { success: true } };
    }

    if (method === "POST" && subPath === "/cancel") {
      const ok = downloadService.cancelTask(taskId);
      if (!ok) return { status: 400, data: { error: "Cannot cancel" } };
      return { status: 200, data: { success: true } };
    }
  }

  return null;
}
