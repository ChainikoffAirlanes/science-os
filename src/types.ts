export type Role = "owner" | "editor" | "viewer";
export type Value = number | string | boolean | null;
export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  avatar_path: string | null;
  bio: string;
  notifications_enabled: boolean;
}
export interface Project {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  hypothesis: string;
  objectives: string;
  methodology: string;
  expected_results: string;
  conclusions: string;
  science_category: string;
  status: string;
  start_date: string;
  due_date: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}
export interface Experiment {
  id: string;
  project_id: string;
  title: string;
  description: string;
  methodology: string;
  experiment_date: string;
  responsible_user_id: string | null;
  version: number;
  updated_at: string;
}
export interface Parameter {
  version: number;
  id: string;
  project_id: string;
  experiment_id: string;
  name: string;
  value_type: "number" | "text" | "datetime" | "boolean";
  unit: string;
  required: boolean;
  sort_order: number;
}
export interface Observation {
  id: string;
  project_id: string;
  experiment_id: string;
  row_number: number;
}
export interface Cell {
  id: string;
  project_id: string;
  experiment_id: string;
  experiment_row_id: string;
  experiment_parameter_id: string;
  value: Value;
  version: number;
}
export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done";
  priority: string;
  assigned_to: string | null;
  due_date: string | null;
  version: number;
  updated_at: string;
}
export interface Member {
  id: string;
  project_id: string;
  user_id: string;
  role: Role;
  joined_at: string;
}
export interface Invite {
  id: string;
  assigned_role: Role;
  expires_at: string;
  use_count: number;
  max_uses: number;
  revoked_at: string | null;
}
export interface ProjectFile {
  version: number;
  id: string;
  project_id: string;
  folder_id: string | null;
  original_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
}
export interface Folder {
  id: string;
  project_id: string;
  parent_folder_id: string | null;
  name: string;
}
export interface Comment {
  id: string;
  task_id: string;
  project_id: string;
  author_id: string;
  body: string;
  created_at: string;
}
export interface Activity {
  id: string;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
}
export interface Publication {
  published_by: string;
  id: string;
  title: string;
  abstract: string;
  visibility: string;
  project_id: string;
  published_at: string;
  public_content: {
    category: string;
    research_type?: string;
    authors: string[];
    sections: Record<string, string>;
    experiments?: { title: string; parameters: Parameter[]; rows: Value[][] }[];
  };
}
export interface Opportunity {
  id: string;
  teacher_id: string;
  title: string;
  description: string;
  subject: string;
  requirements: string;
  deadline: string;
  capacity: number | null;
  status: string;
  version: number;
}
export interface Application {
  id: string;
  opportunity_id: string;
  student_id: string;
  message: string;
  status: string;
  created_at: string;
}
export interface Notification {
  id: string;
  title: string;
  body: string;
  target_url: string;
  read_at: string | null;
  created_at: string;
}
export interface SavedChart {
  id: string;
  title: string;
  chart_type: string;
  configuration: ChartConfig;
}
export interface ChartConfig {
  experimentIds: string[];
  xId: string;
  yIds: string[];
  type: "line" | "bar" | "area" | "comparison";
  from: number;
  to: number;
  title: string;
}
export interface Dataset {
  experiment: Experiment;
  parameters: Parameter[];
  rows: Observation[];
  cells: Cell[];
}
