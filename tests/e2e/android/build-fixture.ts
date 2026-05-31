export function buildAndroidBuildArgs(
  tauriTarget: string,
  cargoFeatures?: string
) {
  return [
    "bun",
    "x",
    "@tauri-apps/cli",
    "android",
    "build",
    "--apk",
    "--target",
    tauriTarget,
    "--ci",
    ...(cargoFeatures ? ["--features", cargoFeatures] : []),
  ];
}
