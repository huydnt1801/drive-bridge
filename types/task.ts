export type TaskStatus = "todo" | "done";
export type TaskPriority = "high" | "medium" | "low";

export interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: string;
  updatedAt: string;
}
