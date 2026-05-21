import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { type ColumnDef, DataTable } from "../DataTable";

const columns: ColumnDef[] = [
  { key: "id", label: "ID", sortable: true },
  { key: "name", label: "Name" },
];

describe("DataTable", () => {
  it("renders rows provided by its parent", () => {
    render(
      <DataTable
        columns={columns}
        loading={false}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        rows={[{ id: "loc-1", isSynced: true, name: "Aisle 1" }]}
        title="Locations"
      />
    );

    expect(screen.getByText("Aisle 1")).toBeTruthy();
    expect(screen.getByText("Locations")).toBeTruthy();
  });

  it("shows a loading state while rows are being fetched", () => {
    render(
      <DataTable
        columns={columns}
        loading
        onDelete={vi.fn().mockResolvedValue(undefined)}
        rows={[]}
        title="Locations"
      />
    );

    expect(screen.getByText("Loading rows…")).toBeTruthy();
  });
});
