import { deadlineMillis, type Category, type Status, type Task } from "./tasks";

export type TaskTab = "active" | "completed";
export type StatusOption = Exclude<Status, "To Do">;

export function statusAfterToggle(current: Status, option: StatusOption, checked: boolean): Status {
  return checked ? option : current === option ? "To Do" : current;
}

export function tasksForView(tasks: Task[], view: "list" | "calendar", tab: TaskTab,
  category: Category | "All", ascending = true): Task[] {
  return tasks.filter(task => (category === "All" || task.category === category) &&
    (view === "calendar" || (task.status === "Submitted/Done") === (tab === "completed")))
    .sort((a, b) => (deadlineMillis(a) - deadlineMillis(b)) * (ascending ? 1 : -1));
}
