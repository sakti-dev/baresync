export function buildInstallApkCommand(serial: string, apkPath: string) {
  return ["adb", "-s", serial, "install", "-r", apkPath];
}

export function buildUninstallAppCommand(serial: string, appId: string) {
  return ["adb", "-s", serial, "uninstall", appId];
}
