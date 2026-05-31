export function buildStayAwakeCommand(serial: string, stayAwake: boolean) {
  return [
    "adb",
    "-s",
    serial,
    "shell",
    "svc",
    "power",
    "stayon",
    stayAwake ? "usb" : "false",
  ];
}

export function buildScreenTimeoutCommand(serial: string, timeoutMs: number) {
  return [
    "adb",
    "-s",
    serial,
    "shell",
    "settings",
    "put",
    "system",
    "screen_off_timeout",
    String(timeoutMs),
  ];
}

export function buildAnimationScaleCommand(serial: string, scale: number) {
  const value = String(scale);
  return [
    "adb",
    "-s",
    serial,
    "shell",
    "settings",
    "put",
    "global",
    "window_animation_scale",
    value,
    ";",
    "settings",
    "put",
    "global",
    "transition_animation_scale",
    value,
    ";",
    "settings",
    "put",
    "global",
    "animator_duration_scale",
    value,
  ];
}
