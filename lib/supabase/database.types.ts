export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type TaskRow = {
  user_id: string; id: string; name: string; due_at: string | null; due_date: string | null;
  category: string; status: string; urls: string[]; source: string; created_at: string;
};
type TaskInsert = Omit<TaskRow, "created_at"> & { created_at?: string };
export type Database = {
  public: {
    Tables: {
      tasks: { Row: TaskRow; Insert: TaskInsert; Update: Partial<TaskInsert>; Relationships: [] };
      task_migrations: {
        Row: { user_id: string; migration_key: string; migrated_at: string; task_count: number };
        Insert: { user_id: string; migration_key: string; task_count: number; migrated_at?: string };
        Update: { task_count?: number }; Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      import_tasks: { Args: { p_tasks: Json }; Returns: number };
      migrate_browser_tasks: { Args: { p_tasks: Json; p_key: string }; Returns: Json };
      consume_import_slot: { Args: Record<string, never>; Returns: Json };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
