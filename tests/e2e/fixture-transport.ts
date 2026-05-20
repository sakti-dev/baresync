export type FixtureTransportMode = "json" | "protobuf";

export const DEFAULT_FIXTURE_TRANSPORT_MODE: FixtureTransportMode = "json";
export const FIXTURE_TRANSPORT_ENV = "BARESYNC_FIXTURE_ENCODING";

export function parseFixtureTransportMode(
  value: string | undefined
): FixtureTransportMode {
  if (value === "protobuf") {
    return "protobuf";
  }

  return DEFAULT_FIXTURE_TRANSPORT_MODE;
}

export function resolveFixtureTransportMode(
  env: Record<string, string | undefined> = process.env
): FixtureTransportMode {
  return parseFixtureTransportMode(env[FIXTURE_TRANSPORT_ENV]);
}
