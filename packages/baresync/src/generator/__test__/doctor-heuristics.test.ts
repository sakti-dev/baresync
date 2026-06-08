import { describe, expect, it } from "vitest";
import { runDiagnostics } from "../diagnostics";
import {
  buildDoctorHeuristicsContract,
  doctorHeuristicsFixtures,
} from "./fixtures/doctor-heuristics";

const pairedTables = [
  {
    apiTable: doctorHeuristicsFixtures.apiTables.customers,
    localTable: doctorHeuristicsFixtures.localTables.customers,
  },
  {
    apiTable: doctorHeuristicsFixtures.apiTables.orders,
    localTable: doctorHeuristicsFixtures.localTables.orders,
  },
  {
    apiTable: doctorHeuristicsFixtures.apiTables.inventoryItems,
    localTable: doctorHeuristicsFixtures.localTables.inventoryItems,
  },
  {
    apiTable: doctorHeuristicsFixtures.apiTables.catalogEntries,
    localTable: doctorHeuristicsFixtures.localTables.catalogEntries,
  },
] as const;

function diagnosticsByCode(code: string) {
  const contract = buildDoctorHeuristicsContract();
  return runDiagnostics(contract, { pairedTables }).filter(
    (diagnostic) => diagnostic.code === code
  );
}

describe("doctor heuristics regressions", () => {
  it("keeps valid paired tables free of scope-watermark warnings", () => {
    const warnings = diagnosticsByCode("SYNC_INDEX_MISSING_SCOPE_WATERMARK");
    expect(warnings.map((warning) => warning.table)).toEqual([
      "inventory_items",
    ]);
  });

  it("treats the trailing id index as valid", () => {
    const warnings = diagnosticsByCode("SYNC_INDEX_MISSING_SCOPE_WATERMARK");
    expect(warnings.some((warning) => warning.table === "orders")).toBe(false);
  });

  it("does not warn on the default built-in one-sided columns", () => {
    const warnings = diagnosticsByCode(
      "SYNC_SCHEMA_BATTERIES_INCLUDED_NOT_1_TO_1"
    );
    expect(warnings.some((warning) => warning.table === "customers")).toBe(
      false
    );
    expect(warnings.some((warning) => warning.table === "orders")).toBe(false);
  });

  it("still warns when additional local-only and server-only business columns remain", () => {
    const warnings = diagnosticsByCode(
      "SYNC_SCHEMA_BATTERIES_INCLUDED_NOT_1_TO_1"
    );
    expect(warnings.map((warning) => warning.table)).toEqual([
      "catalog_entries",
    ]);
  });

  it("does not emit retired heuristic warnings for any fixture table", () => {
    const diagnostics = runDiagnostics(buildDoctorHeuristicsContract(), {
      pairedTables,
    });
    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "SYNC_INDEX_MISSING_LOCAL_DIRTY" ||
          diagnostic.code === "SYNC_SCHEMA_NO_CONFLICT_STRATEGY" ||
          diagnostic.code === "SYNC_SCHEMA_NO_DELETE_STRATEGY"
      )
    ).toBe(false);
  });
});
