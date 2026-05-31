const DEFAULT_FIXTURE_BACKEND_HOST = "0.0.0.0";

export function resolveFixtureBackendHost(
  env: Record<string, string | undefined> = process.env
) {
  const explicitHost = env.BARESYNC_FIXTURE_BACKEND_HOST;
  if (typeof explicitHost === "string" && explicitHost.trim().length > 0) {
    return explicitHost.trim();
  }

  return DEFAULT_FIXTURE_BACKEND_HOST;
}
