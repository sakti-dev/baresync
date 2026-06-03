export type FixtureTransportMode = "json";

export const DEFAULT_FIXTURE_TRANSPORT_MODE: FixtureTransportMode = "json";
export const FIXTURE_TRANSPORT_ENV = "BARESYNC_FIXTURE_ENCODING";

function parseFixtureTransportMode(
  _value: string | undefined
): FixtureTransportMode {
  return DEFAULT_FIXTURE_TRANSPORT_MODE;
}

export function resolveFixtureTransportMode(
  env: Record<string, string | undefined> = process.env
): FixtureTransportMode {
  return parseFixtureTransportMode(env[FIXTURE_TRANSPORT_ENV]);
}
