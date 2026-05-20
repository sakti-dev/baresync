## 1. Server Helper Primitives

- [x] 1.1 Add helper types and implementations in `packages/baresync/src/server/service.ts`.
- [x] 1.2 Export the new helpers from `packages/baresync/src/server/index.ts`.
- [x] 1.3 Add unit tests covering cursor timestamp parsing, row splitting, pull table building, changed table detection, table validation, and latest cursor formatting.

## 2. Inventory Example Adoption

- [x] 2.1 Update `examples/inventory/apps/server/src/db/repository.ts` to import and use the helper primitives.
- [x] 2.2 Remove local helper implementations that are replaced by public server helpers.
- [x] 2.3 Verify push row builders and Drizzle write branches remain explicit in the repository.

## 3. Verification

- [x] 3.1 Run `bun x ultracite check`.
- [x] 3.2 Run `bun x ultracite fix` if safe formatting or lint fixes are reported, then re-run `bun x ultracite check`.
- [x] 3.3 Run the repository typecheck script.
- [x] 3.4 Run relevant server primitive and inventory example tests or builds.
