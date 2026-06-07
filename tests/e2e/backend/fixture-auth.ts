export const FIXTURE_AUTH_TOKEN_ENV = "BARESYNC_FIXTURE_AUTH_TOKEN";

export function resolveFixtureAuthToken(
  env: Record<string, string | undefined> = process.env
) {
  const token = env[FIXTURE_AUTH_TOKEN_ENV];
  if (typeof token !== "string") {
    return null;
  }

  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function expectedFixtureAuthorization(token: string) {
  return `Bearer ${token}`;
}

export function requireFixtureAuthorization(
  request: Request,
  env: Record<string, string | undefined> = process.env
) {
  const token = resolveFixtureAuthToken(env);
  if (token === null) {
    return null;
  }

  const expected = expectedFixtureAuthorization(token);
  const actual = request.headers.get("authorization");
  if (actual === expected) {
    return null;
  }

  return Response.json({ error: "unauthorized" }, { status: 401 });
}
