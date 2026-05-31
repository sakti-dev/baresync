const INTERFACE_HEADER_RE = /^\d+:\s+([^:]+):/;
const IPV4_RE = /\binet\s+(\d{1,3}(?:\.\d{1,3}){3})\/(\d+)\b/;

const IGNORED_INTERFACE_PREFIXES = [
  "br-",
  "docker",
  "lo",
  "tailscale",
  "tun",
  "veth",
  "virbr",
  "wg",
];

function isIgnoredInterface(name: string) {
  return (
    name === "CloudflareWARP" ||
    IGNORED_INTERFACE_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

export function inferLanHostAddressFromIpAddr(output: string) {
  let interfaceName: string | null = null;
  let isUsableInterface = false;

  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    const header = INTERFACE_HEADER_RE.exec(line);
    if (header) {
      interfaceName = header[1];
      isUsableInterface =
        !isIgnoredInterface(interfaceName) &&
        line.includes("BROADCAST") &&
        line.includes("UP");
      continue;
    }

    if (!(interfaceName && isUsableInterface)) {
      continue;
    }

    const match = IPV4_RE.exec(line);
    if (match && line.includes(" brd ") && match[2] !== "32") {
      return match[1];
    }
  }

  return null;
}
