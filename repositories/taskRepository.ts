import { firestore } from "@/lib/firebaseAdmin";
import type { TaskItem, TaskPriority, TaskStatus } from "@/types/task";

const collection = firestore.collection("driverBridgeTasks");

function normalizeTask(task: TaskItem & { priority?: TaskPriority; status?: TaskStatus | "doing" }): TaskItem {
  return {
    ...task,
    status: task.status === "done" ? "done" : "todo",
    priority: task.priority || "medium",
  };
}

export const taskRepository = {
  list: async () => {
    const snapshot = await collection.orderBy("createdAt", "desc").get();
    const priorityOrder: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
    return snapshot.docs
      .map((document) => {
        const task = document.data() as TaskItem & { priority?: TaskPriority; status?: TaskStatus | "doing" };
        return normalizeTask(task);
      })
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  },
  add: async (task: TaskItem) => {
    await collection.doc(task.id).create(task);
  },
  update: async (id: string, patch: { title?: string; status?: TaskStatus; priority?: TaskPriority }) => {
    const reference = collection.doc(id);
    const existing = await reference.get();
    if (!existing.exists) return undefined;
    await reference.update({ ...patch, updatedAt: new Date().toISOString() });
    return normalizeTask((await reference.get()).data() as TaskItem & { priority?: TaskPriority; status?: TaskStatus | "doing" });
  },
  remove: async (id: string) => {
    const reference = collection.doc(id);
    const existing = await reference.get();
    if (!existing.exists) return false;
    await reference.delete();
    return true;
  },
};
