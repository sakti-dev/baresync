const BOUNDS_RE = /^\[(\d+),(\d+)]\[(\d+),(\d+)]$/;
const NODE_RE = /<node\b[^>]*>/g;
const TEXT_ATTR_RE = /\btext="([^"]*)"/;
const BOUNDS_ATTR_RE = /\bbounds="([^"]*)"/;

export interface Bounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface Point {
  x: number;
  y: number;
}

export function parseBounds(value: string): Bounds {
  const match = BOUNDS_RE.exec(value);
  if (!match) {
    throw new Error(`Invalid Android bounds: ${value}`);
  }

  const [, left, top, right, bottom] = match;
  return {
    bottom: Number(bottom),
    left: Number(left),
    right: Number(right),
    top: Number(top),
  };
}

export function centerOfBounds(bounds: Bounds): Point {
  return {
    x: Math.round((bounds.left + bounds.right) / 2),
    y: Math.round((bounds.top + bounds.bottom) / 2),
  };
}

export function buildAdbLaunchCommand(serial: string, appId: string): string[] {
  return [
    "adb",
    "-s",
    serial,
    "shell",
    "am",
    "start",
    "-W",
    "-n",
    `${appId}/.MainActivity`,
  ];
}

export function buildAdbTapCommand(serial: string, bounds: Bounds): string[] {
  const point = centerOfBounds(bounds);
  return [
    "adb",
    "-s",
    serial,
    "shell",
    "input",
    "tap",
    String(point.x),
    String(point.y),
  ];
}

function decodeXmlAttribute(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function collectTextNodes(
  uiDump: string
): Array<{ bounds: Bounds; text: string }> {
  return [...uiDump.matchAll(NODE_RE)].flatMap((nodeMatch) => {
    const node = nodeMatch[0];
    const textMatch = TEXT_ATTR_RE.exec(node);
    const boundsMatch = BOUNDS_ATTR_RE.exec(node);
    if (!(textMatch && boundsMatch)) {
      return [];
    }

    const text = decodeXmlAttribute(textMatch[1]);
    if (text.length === 0) {
      return [];
    }

    return [
      {
        bounds: parseBounds(boundsMatch[1]),
        text,
      },
    ];
  });
}

export function findNodeBoundsByText(
  uiDump: string,
  expectedText: string
): Bounds | null {
  return (
    collectTextNodes(uiDump).find(({ text }) => text === expectedText)
      ?.bounds ?? null
  );
}

export function hasUiText(uiDump: string, expectedText: string): boolean {
  return collectTextNodes(uiDump).some(({ text }) =>
    text.includes(expectedText)
  );
}
