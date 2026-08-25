export type TaskStatus = "todo" | "doing" | "done";

export interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}
