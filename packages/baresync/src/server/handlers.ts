import { DEFAULT_API_MAX_PUSH_BYTES, DEFAULT_MAX_PUSH_ROWS } from "../limits";
import {
  createIdempotencyGuard,
  type SyncIdempotencyDatabase,
} from "./idempotency.js";
import {
  decodeSyncRequest,
  encodeSyncResponse,
  mapSyncError,
  orderPushChanges,
  validatePushEnvelope,
} from "./service";

type Awaitable<T> = T | Promise<T>;

export type SyncHandler<TContext> = (
  request: Request,
  context: TContext
) => Promise<Response>;

export interface SyncAuthorizedScope<TScope> {
  ok: true;
  scope: TScope;
}

export interface SyncUnauthorizedScopeResponse {
  body: unknown;
  ok: false;
  status: number;
}

export type SyncScopeResolution<TScope> =
  | SyncAuthorizedScope<TScope>
  | SyncUnauthorizedScopeResponse;

export interface SyncResolveScopeInput<TContext> {
  context: TContext;
  request: Request;
  scopeId: string;
}

export interface SyncPushChange {
  changedRows: unknown[];
  deletedIds: string[];
  table: string;
}

export interface SyncPushChangesInput<TContext, TScope> {
  changes: readonly SyncPushChange[];
  clientId: string;
  context: TContext;
  idempotencyKey: string;
  request: Request;
  requestHash: string;
  scope: TScope;
  scopeId: string;
  syncUpdatedAt: number;
}

export interface SyncLoadStatusInput<TContext, TScope> {
  context: TContext;
  cursor: string;
  request: Request;
  scope: TScope;
  scopeId: string;
}

export interface SyncLoadPullChangesInput<TContext, TScope> {
  context: TContext;
  cursor: string;
  limit: number;
  request: Request;
  scope: TScope;
  scopeId: string;
  tables: readonly string[];
}

interface SyncHandlerError extends Error {
  status?: number;
}

interface SyncPushHandlerBase<
  TContext,
  TScope,
  TDb extends SyncIdempotencyDatabase = SyncIdempotencyDatabase,
> {
  applyPushChanges: (
    input: SyncPushChangesInput<TContext, TScope>
  ) => Awaitable<unknown>;
  idempotency: {
    db: TDb;
  };
  resolveScope: (
    input: SyncResolveScopeInput<TContext>
  ) => Awaitable<SyncScopeResolution<TScope>>;
  upsertOrder: readonly string[];
}

interface SyncStatusHandlerBase<TContext, TScope> {
  loadSyncStatus: (
    input: SyncLoadStatusInput<TContext, TScope>
  ) => Awaitable<unknown>;
  resolveScope: (
    input: SyncResolveScopeInput<TContext>
  ) => Awaitable<SyncScopeResolution<TScope>>;
}

interface SyncPullHandlerBase<TContext, TScope> {
  limit: number;
  loadPullChanges: (
    input: SyncLoadPullChangesInput<TContext, TScope>
  ) => Awaitable<unknown>;
  resolveScope: (
    input: SyncResolveScopeInput<TContext>
  ) => Awaitable<SyncScopeResolution<TScope>>;
}

export type SyncPushHandlerOptions<
  TContext,
  TScope,
  TDb extends SyncIdempotencyDatabase = SyncIdempotencyDatabase,
> = SyncPushHandlerBase<TContext, TScope, TDb>;

export type SyncStatusHandlerOptions<TContext, TScope> = SyncStatusHandlerBase<
  TContext,
  TScope
>;

export type SyncPullHandlerOptions<TContext, TScope> = SyncPullHandlerBase<
  TContext,
  TScope
>;

function toSyncErrorResponse(error: unknown): Response {
  const mapped = mapSyncError(error);
  const status = getErrorStatus(error, mapped.code);
  return Response.json(mapped, { status });
}

function getErrorStatus(error: unknown, code: string): number {
  if (
    error !== null &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as SyncHandlerError).status === "number"
  ) {
    return (error as SyncHandlerError).status!;
  }

  switch (code) {
    case "sync_unauthorized":
      return 401;
    case "sync_payload_too_large":
      return 413;
    case "sync_idempotency_conflict":
      return 409;
    case "sync_scope_invalid":
      return 403;
    case "sync_cursor_invalid":
      return 400;
    default:
      return 500;
  }
}

async function decodeAuthorizedScope<TContext, TScope>(input: {
  context: TContext;
  request: Request;
  resolveScope: (
    input: SyncResolveScopeInput<TContext>
  ) => Awaitable<SyncScopeResolution<TScope>>;
  scopeId: string;
}): Promise<SyncAuthorizedScope<TScope> | Response> {
  const scope = await input.resolveScope({
    context: input.context,
    request: input.request,
    scopeId: input.scopeId,
  });

  if (!scope.ok) {
    return Response.json(scope.body, { status: scope.status });
  }

  return scope;
}

export function createSyncPushHandler<TContext, TScope>(
  options: SyncPushHandlerOptions<TContext, TScope>
): SyncHandler<TContext> {
  const idempotency = createIdempotencyGuard(options.idempotency);

  return async (request, context) => {
    try {
      const decoded = await decodeSyncRequest({
        kind: "push",
        request,
      });

      validatePushEnvelope(decoded, {
        maxBytes: DEFAULT_API_MAX_PUSH_BYTES,
        maxRows: DEFAULT_MAX_PUSH_ROWS,
      });

      const scope = await decodeAuthorizedScope({
        context,
        request,
        resolveScope: options.resolveScope,
        scopeId: decoded.body.scopeId as string,
      });

      if (scope instanceof Response) {
        return scope;
      }

      const syncUpdatedAt = Date.now();
      const orderedChanges = orderPushChanges({
        changes: decoded.body.tables as SyncPushChange[],
        order: options.upsertOrder,
      });

      const result = await idempotency.run(
        {
          clientId: decoded.body.clientId as string,
          idempotencyKey: decoded.body.idempotencyKey as string,
          requestHash: decoded.requestHash,
        },
        async () =>
          options.applyPushChanges({
            changes: orderedChanges,
            clientId: decoded.body.clientId as string,
            context,
            idempotencyKey: decoded.body.idempotencyKey as string,
            request,
            requestHash: decoded.requestHash,
            scope: scope.scope,
            scopeId: decoded.body.scopeId as string,
            syncUpdatedAt,
          })
      );

      return encodeSyncResponse({
        body: result.result,
        kind: "push",
      });
    } catch (error) {
      return toSyncErrorResponse(error);
    }
  };
}

export function createSyncStatusHandler<TContext, TScope>(
  options: SyncStatusHandlerOptions<TContext, TScope>
): SyncHandler<TContext> {
  return async (request, context) => {
    try {
      const decoded = await decodeSyncRequest({
        kind: "status",
        request,
      });

      const scope = await decodeAuthorizedScope({
        context,
        request,
        resolveScope: options.resolveScope,
        scopeId: decoded.body.scopeId as string,
      });

      if (scope instanceof Response) {
        return scope;
      }

      const result = await options.loadSyncStatus({
        context,
        cursor: decoded.body.cursor as string,
        request,
        scope: scope.scope,
        scopeId: decoded.body.scopeId as string,
      });

      return encodeSyncResponse({
        body: result,
        kind: "status",
      });
    } catch (error) {
      return toSyncErrorResponse(error);
    }
  };
}

export function createSyncPullHandler<TContext, TScope>(
  options: SyncPullHandlerOptions<TContext, TScope>
): SyncHandler<TContext> {
  return async (request, context) => {
    try {
      const decoded = await decodeSyncRequest({
        kind: "pull",
        request,
      });

      const scope = await decodeAuthorizedScope({
        context,
        request,
        resolveScope: options.resolveScope,
        scopeId: decoded.body.scopeId as string,
      });

      if (scope instanceof Response) {
        return scope;
      }

      const result = await options.loadPullChanges({
        context,
        cursor: decoded.body.cursor as string,
        limit: options.limit,
        request,
        scope: scope.scope,
        scopeId: decoded.body.scopeId as string,
        tables: decoded.body.tables as string[],
      });

      return encodeSyncResponse({
        body: result,
        kind: "pull",
      });
    } catch (error) {
      return toSyncErrorResponse(error);
    }
  };
}
