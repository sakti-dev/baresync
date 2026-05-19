import baselinePullFixture from "../../../fixtures/sync/category-product-baseline-pull.json";
import pushFixture from "../../../fixtures/sync/category-product-push.json";
import idempotentReplayFixture from "../../../fixtures/sync/idempotent-replay.json";
import payloadTooLargeFixture from "../../../fixtures/sync/payload-too-large.json";
import serverSoftDeleteFixture from "../../../fixtures/sync/server-soft-delete.json";
import serverWinsRejectionFixture from "../../../fixtures/sync/server-wins-rejection.json";

export const baselinePull =
  baselinePullFixture as typeof baselinePullFixture & {
    tables: Array<{
      table: string;
      changedRows: unknown[];
      deletedIds: string[];
    }>;
  };
export const pushBody = pushFixture as typeof pushFixture & {
  tables: Array<{
    table: string;
    changedRows: unknown[];
    deletedIds: string[];
  }>;
};
export const serverSoftDelete =
  serverSoftDeleteFixture as typeof serverSoftDeleteFixture & {
    tables: Array<{
      table: string;
      changedRows: unknown[];
      deletedIds: string[];
    }>;
  };
export const serverWinsRejection =
  serverWinsRejectionFixture as typeof serverWinsRejectionFixture & {
    pushResponse: {
      serverTime: string;
      tables: Array<{
        table: string;
        acceptedCreatedIds: string[];
        acceptedUpdatedIds: string[];
        acceptedDeletedIds: string[];
        rejected: Array<{ id: string; reason: string }>;
      }>;
    };
    reconciliationPull: {
      cursor: string;
      hasMore: boolean;
      serverTime: string;
      tables: Array<{
        table: string;
        changedRows: unknown[];
        deletedIds: string[];
      }>;
    };
  };
export const idempotentReplay =
  idempotentReplayFixture as typeof idempotentReplayFixture & {
    firstRequest: {
      scopeId: string;
      clientId: string;
      idempotencyKey: string;
      requestHash: string;
      tables: unknown[];
    };
    secondRequest: {
      scopeId: string;
      clientId: string;
      idempotencyKey: string;
      requestHash: string;
      tables: unknown[];
    };
  };
export const payloadTooLarge =
  payloadTooLargeFixture as typeof payloadTooLargeFixture & {
    tables: Array<{
      table: string;
      changedRows: unknown[];
      deletedIds: string[];
    }>;
  };
