import { describe, expect, it } from "vitest";
import { inferLanHostAddressFromIpAddr } from "./host-address";

const HOST_IP_ADDR = `1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    inet 127.0.0.1/8 scope host lo
2: wlp2s0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP group default qlen 1000
    inet 192.168.1.2/24 brd 192.168.1.255 scope global noprefixroute wlp2s0
3: docker0: <NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 qdisc noqueue state DOWN group default
    inet 172.17.0.1/16 brd 172.17.255.255 scope global docker0
9: CloudflareWARP: <POINTOPOINT,MULTICAST,NOARP,UP,LOWER_UP> mtu 1280 qdisc mq state UNKNOWN group default qlen 500
    inet 172.16.0.2/32 scope global CloudflareWARP
`;

describe("inferLanHostAddressFromIpAddr", () => {
  it("prefers a broadcast LAN address over VPN and container interfaces", () => {
    expect(inferLanHostAddressFromIpAddr(HOST_IP_ADDR)).toBe("192.168.1.2");
  });

  it("returns null when no LAN address is available", () => {
    expect(
      inferLanHostAddressFromIpAddr(`9: CloudflareWARP: <POINTOPOINT,UP> mtu 1280
    inet 172.16.0.2/32 scope global CloudflareWARP
`)
    ).toBeNull();
  });
});
