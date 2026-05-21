import type { ColumnDef } from "../components/DataTable";

export const LOCATION_COLUMNS: ColumnDef[] = [
  { key: "id", label: "ID", sortable: true },
  { key: "name", label: "Name", sortable: true },
  { key: "createdAt", label: "Created", sortable: true },
  { key: "updatedAt", label: "Updated", sortable: true },
];

export const ITEM_COLUMNS: ColumnDef[] = [
  { key: "id", label: "ID", sortable: true },
  { key: "name", label: "Name", sortable: true },
  { key: "sku", label: "SKU", sortable: true },
  { key: "locationId", label: "Location" },
  { key: "updatedAt", label: "Updated", sortable: true },
];

export const COUNT_COLUMNS: ColumnDef[] = [
  { key: "id", label: "ID", sortable: true },
  { key: "itemId", label: "Item" },
  { key: "countedQuantity", label: "Qty", sortable: true },
  { key: "recordedAt", label: "Recorded", sortable: true },
  { key: "updatedAt", label: "Updated", sortable: true },
];
