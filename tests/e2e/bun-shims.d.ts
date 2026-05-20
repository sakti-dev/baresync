declare module "bun:sqlite" {
  export class Database {
    constructor(filename: string, options?: unknown);
    exec(sql: string): unknown;
    query(sql: string): {
      all(...params: unknown[]): Record<string, unknown>[];
    };
    run(sql: string, ...params: unknown[]): unknown;
    close(): void;
  }
}
