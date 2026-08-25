import { firestore } from "@/lib/firebaseAdmin";
import type { TaskItem, TaskStatus } from "@/types/task";

const collection = firestore.collection("driverBridgeTasks");

export const taskRepository = {
  list: async () => {
    const snapshot = await collection.orderBy("createdAt", "desc").get();
    return snapshot.docs.map((document) => document.data() as TaskItem);
  },
  add: async (task: TaskItem) => {
    await collection.doc(task.id).create(task);
  },
  update: async (id: string, patch: { title?: string; status?: TaskStatus }) => {
    const reference = collection.doc(id);
    const existing = await reference.get();
    if (!existing.exists) return undefined;
    await reference.update({ ...patch, updatedAt: new Date().toISOString() });
    return (await reference.get()).data() as TaskItem;
  },
  remove: async (id: string) => {
    const reference = collection.doc(id);
    const existing = await reference.get();
    if (!existing.exists) return false;
    await reference.delete();
    return true;
  },
};
