export interface MigrationEntry {
  name: string;
  sql: string;
}

export interface MigrationStatus {
  applied: string[];
  pending: string[];
}
