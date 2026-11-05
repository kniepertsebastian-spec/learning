import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, createGuardedLookup, isPrivateOrReservedIp, UnsafeUrlError, type ResolvedAddress } from "./ssrf-guard";

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

describe("more IPv6 ranges that can reach internal targets", () => {
  it("flags NAT64, 6to4, Teredo and site-local addresses", () => {
    expect(isPrivateOrReservedIp("64:ff9b::a00:1", "ipv6")).toBe(true); // NAT64 für 10.0.0.1
    expect(isPrivateOrReservedIp("2002:a00:1::1", "ipv6")).toBe(true); // 6to4 für 10.0.0.1
    expect(isPrivateOrReservedIp("2001:0:4136:e378:8000:63bf:3fff:fdd2", "ipv6")).toBe(true); // Teredo
    expect(isPrivateOrReservedIp("fec0::1", "ipv6")).toBe(true); // Site-local
  });

  it("still lets a normal global address through", () => {
    expect(isPrivateOrReservedIp("2606:4700:4700::1111", "ipv6")).toBe(false);
  });
});

describe("createGuardedLookup", () => {
  const lookupOf = (addresses: ResolvedAddress[]) => createGuardedLookup(async () => addresses);
  const run = (lookup: ReturnType<typeof createGuardedLookup>, options: { all?: boolean; family?: number } = {}) =>
    new Promise<{ error: Error | null; address: unknown; family: unknown }>((resolve) => {
      lookup("example.test", options, (error, address, family) => resolve({ error, address, family }));
    });

  it("hands out a public address", async () => {
    const result = await run(lookupOf([{ address: "93.184.216.34", family: 4 }]));
    expect(result).toEqual({ error: null, address: "93.184.216.34", family: 4 });
  });

  it("returns the whole list when asked for all addresses (happy eyeballs)", async () => {
    const result = await run(lookupOf([{ address: "93.184.216.34", family: 4 }, { address: "2606:4700::1111", family: 6 }]), { all: true });
    expect(result.address).toEqual([{ address: "93.184.216.34", family: 4 }, { address: "2606:4700::1111", family: 6 }]);
  });

  it("rejects a name that resolves to a private address", async () => {
    const result = await run(lookupOf([{ address: "169.254.169.254", family: 4 }]));
    expect(result.error).toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects the whole name when only one of several addresses is private", async () => {
    const result = await run(lookupOf([{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 }]), { all: true });
    expect(result.error).toBeInstanceOf(UnsafeUrlError);
  });

  it("asks the resolver again on every connection, so a changed answer is caught (DNS rebinding)", async () => {
    let calls = 0;
    const lookup = createGuardedLookup(async () => (++calls === 1 ? [{ address: "93.184.216.34", family: 4 }] : [{ address: "127.0.0.1", family: 4 }]));
    expect((await run(lookup)).error).toBeNull();
    expect((await run(lookup)).error).toBeInstanceOf(UnsafeUrlError);
  });

  it("passes a failed resolution on", async () => {
    const result = await run(createGuardedLookup(async () => { throw new Error("ENOTFOUND"); }));
    expect(result.error?.message).toBe("ENOTFOUND");
  });
});
