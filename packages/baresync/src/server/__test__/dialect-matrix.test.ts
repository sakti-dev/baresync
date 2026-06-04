import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PlanetScaleDatabase } from "drizzle-orm/planetscale-serverless";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { SingleStoreDriverDatabase } from "drizzle-orm/singlestore";
import type { TiDBServerlessDatabase } from "drizzle-orm/tidb-serverless";
import type { VercelPgDatabase } from "drizzle-orm/vercel-postgres";
import type { XataHttpDatabase } from "drizzle-orm/xata-http";
import { expect, it } from "vitest";
import type { SyncIdempotencyDatabase } from "../idempotency";

type AssertTrue<T extends true> = T;

type IsAssignable<T, U> = T extends U ? true : false;

interface DialectAssertions {
  betterSQLite: AssertTrue<
    IsAssignable<
      BetterSQLite3Database<Record<string, never>>,
      SyncIdempotencyDatabase
    >
  >;
  bunSQLite: AssertTrue<
    IsAssignable<
      BunSQLiteDatabase<Record<string, never>>,
      SyncIdempotencyDatabase
    >
  >;
  bunSql: AssertTrue<
    IsAssignable<BunSQLDatabase<Record<string, never>>, SyncIdempotencyDatabase>
  >;
  d1: AssertTrue<
    IsAssignable<
      DrizzleD1Database<Record<string, never>>,
      SyncIdempotencyDatabase
    >
  >;
  libSql: AssertTrue<
    IsAssignable<LibSQLDatabase<Record<string, never>>, SyncIdempotencyDatabase>
  >;
  mysql2: AssertTrue<
    IsAssignable<MySql2Database<Record<string, never>>, SyncIdempotencyDatabase>
  >;
  neonHttp: AssertTrue<
    IsAssignable<
      NeonHttpDatabase<Record<string, never>>,
      SyncIdempotencyDatabase
    >
  >;
  neonServerless: AssertTrue<
    IsAssignable<NeonDatabase<Record<string, never>>, SyncIdempotencyDatabase>
  >;
  nodePg: AssertTrue<
    IsAssignable<NodePgDatabase<Record<string, never>>, SyncIdempotencyDatabase>
  >;
  pglite: AssertTrue<
    IsAssignable<PgliteDatabase<Record<string, never>>, SyncIdempotencyDatabase>
  >;
  planetScale: AssertTrue<
    IsAssignable<
      PlanetScaleDatabase<Record<string, never>>,
      SyncIdempotencyDatabase
    >
  >;
  postgresJs: AssertTrue<
    IsAssignable<
      PostgresJsDatabase<Record<string, never>>,
      SyncIdempotencyDatabase
    >
  >;
  singleStore: AssertTrue<
    IsAssignable<
      SingleStoreDriverDatabase<Record<string, never>>,
      SyncIdempotencyDatabase
    >
  >;
  tidbServerless: AssertTrue<
    IsAssignable<
      TiDBServerlessDatabase<Record<string, never>>,
      SyncIdempotencyDatabase
    >
  >;
  vercelPg: AssertTrue<
    IsAssignable<
      VercelPgDatabase<Record<string, never>>,
      SyncIdempotencyDatabase
    >
  >;
  xataHttp: AssertTrue<
    IsAssignable<
      XataHttpDatabase<Record<string, never>>,
      SyncIdempotencyDatabase
    >
  >;
}

const dialectAssertions: DialectAssertions = {
  betterSQLite: true,
  bunSQLite: true,
  bunSql: true,
  d1: true,
  libSql: true,
  mysql2: true,
  neonHttp: true,
  neonServerless: true,
  nodePg: true,
  pglite: true,
  planetScale: true,
  postgresJs: true,
  singleStore: true,
  tidbServerless: true,
  vercelPg: true,
  xataHttp: true,
};

// The type assertions above are the compile-time contract. This runtime test keeps
// the file in the normal test suite without affecting behavior.
it("keeps the idempotency dialect matrix compiled", () => {
  expect(dialectAssertions).toEqual({
    betterSQLite: true,
    bunSQLite: true,
    bunSql: true,
    d1: true,
    libSql: true,
    mysql2: true,
    neonHttp: true,
    neonServerless: true,
    nodePg: true,
    pglite: true,
    planetScale: true,
    postgresJs: true,
    singleStore: true,
    tidbServerless: true,
    vercelPg: true,
    xataHttp: true,
  });
});
