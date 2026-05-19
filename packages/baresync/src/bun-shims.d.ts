declare module "bun:test" {
  export { describe, expect, it, test } from "vitest";
}

declare module "bun:sqlite" {
  export class Database {
    constructor(filename: string, options?: unknown);
    exec(sql: string): unknown;
    run(sql: string, ...params: unknown[]): unknown;
    close(): void;
  }
}
