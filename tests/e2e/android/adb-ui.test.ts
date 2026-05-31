import { describe, expect, it } from "vitest";
import {
  buildAdbLaunchCommand,
  buildAdbTapCommand,
  centerOfBounds,
  findNodeBoundsByText,
  hasUiText,
  parseBounds,
} from "./adb-ui";

const uiDump = `
<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.webkit.WebView" bounds="[0,0][1080,2400]">
    <node index="1" text="Baseline sync" resource-id="" class="android.widget.Button" bounds="[48,800][332,912]" />
    <node index="2" text="Create local row" resource-id="" class="android.widget.Button" bounds="[372,800][744,912]" />
    <node index="3" text="Smoke State dirty:0 cat:Drinks prod:Kopi Susu" resource-id="" class="android.widget.TextView" bounds="[48,520][1032,590]" />
  </node>
</hierarchy>`;

describe("ADB UI helpers", () => {
  it("parses Android UIAutomator bounds", () => {
    expect(parseBounds("[372,800][744,912]")).toEqual({
      bottom: 912,
      left: 372,
      right: 744,
      top: 800,
    });
  });

  it("finds visible nodes by exact text and returns their bounds", () => {
    expect(findNodeBoundsByText(uiDump, "Create local row")).toEqual({
      bottom: 912,
      left: 372,
      right: 744,
      top: 800,
    });
  });

  it("matches visible state by substring", () => {
    expect(hasUiText(uiDump, "cat:Drinks")).toBe(true);
    expect(hasUiText(uiDump, "missing-row")).toBe(false);
  });

  it("builds deterministic launch and tap commands", () => {
    const bounds = parseBounds("[372,800][744,912]");

    expect(centerOfBounds(bounds)).toEqual({ x: 558, y: 856 });
    expect(buildAdbTapCommand("device-1", bounds)).toEqual([
      "adb",
      "-s",
      "device-1",
      "shell",
      "input",
      "tap",
      "558",
      "856",
    ]);
    expect(buildAdbLaunchCommand("device-1", "com.baresync.fixture")).toEqual([
      "adb",
      "-s",
      "device-1",
      "shell",
      "am",
      "start",
      "-W",
      "-n",
      "com.baresync.fixture/.MainActivity",
    ]);
  });
});
