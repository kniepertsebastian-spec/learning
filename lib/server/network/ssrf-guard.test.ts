import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, isPrivateOrReservedIp, UnsafeUrlError } from "./ssrf-guard";

describe("isPrivateOrReservedIp", () => {
  it("flags well-known private/reserved IPv4 ranges", () => {
    expect(isPrivateOrReservedIp("10.1.2.3", "ipv4")).toBe(true);
    expect(isPrivateOrReservedIp("172.16.0.1", "ipv4")).toBe(true);
    expect(isPrivateOrReservedIp("192.168.1.1", "ipv4")).toBe(true);
    expect(isPrivateOrReservedIp("127.0.0.1", "ipv4")).toBe(true);
    expect(isPrivateOrReservedIp("169.254.169.254", "ipv4")).toBe(true); // Cloud metadata
    expect(isPrivateOrReservedIp("0.0.0.0", "ipv4")).toBe(true);
  });

  it("does not flag a public IPv4 address", () => {
    expect(isPrivateOrReservedIp("8.8.8.8", "ipv4")).toBe(false);
    expect(isPrivateOrReservedIp("1.1.1.1", "ipv4")).toBe(false);
  });

  it("flags well-known private/reserved IPv6 ranges", () => {
    expect(isPrivateOrReservedIp("::1", "ipv6")).toBe(true); // Loopback
    expect(isPrivateOrReservedIp("fe80::1", "ipv6")).toBe(true); // Link-local
    expect(isPrivateOrReservedIp("fc00::1", "ipv6")).toBe(true); // Unique local
  });

  it("does not flag a public IPv6 address", () => {
    expect(isPrivateOrReservedIp("2001:4860:4860::8888", "ipv6")).toBe(false); // Google public DNS
  });

  it("flags an IPv4-mapped IPv6 address whose embedded IPv4 is private", () => {
    expect(isPrivateOrReservedIp("::ffff:169.254.169.254", "ipv6")).toBe(true);
  });
});

describe("assertPublicHttpUrl", () => {
  it("rejects a non-http(s) scheme without any network access", async () => {
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects localhost without any DNS lookup", async () => {
    await expect(assertPublicHttpUrl("http://localhost/")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects a syntactically invalid URL", async () => {
    await expect(assertPublicHttpUrl("not a url")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects a URL whose hostname is a literal private IP", async () => {
    await expect(assertPublicHttpUrl("http://127.0.0.1/")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicHttpUrl("http://169.254.169.254/latest/meta-data/")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    await expect(assertPublicHttpUrl("http://10.0.0.5/")).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});
