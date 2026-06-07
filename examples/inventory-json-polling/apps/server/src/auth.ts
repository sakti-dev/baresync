const INVENTORY_SYNC_TOKEN_ENV = "INVENTORY_SYNC_TOKEN";

export interface AuthorizationCheckOk {
  ok: true;
}

export interface AuthorizationCheckFailed {
  body: {
    error: string;
  };
  ok: false;
  status: 401;
}

export function resolveInventoryAuthToken(
  env: Record<string, string | undefined> = process.env
) {
  const token = env[INVENTORY_SYNC_TOKEN_ENV]?.trim() || "demo-token";
  return token;
}

export function expectedInventoryAuthorization(token: string) {
  return `Bearer ${token}`;
}

export function requireInventoryAuthorization(
  request: Request,
  expectedToken = resolveInventoryAuthToken()
): AuthorizationCheckOk | AuthorizationCheckFailed {
  const authorization = request.headers.get("authorization");
  const expectedAuthorization = expectedInventoryAuthorization(expectedToken);

  if (authorization !== expectedAuthorization) {
    return {
      ok: false,
      status: 401,
      body: { error: "missing_or_invalid_authorization" },
    };
  }

  return { ok: true };
}
