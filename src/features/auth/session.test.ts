import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { homeFor, safeNextPath } = await import("./session");
type U = Parameters<typeof homeFor>[0];
const as = (role: U["role"]): U => ({ id: "x", email: null, fullName: null, roles: [role], role, permissions: {} });

describe("homeFor (installed app start page and post-login landing)", () => {
  it("sends each role to its own dashboard", () => {
    expect(homeFor(as("customer"))).toBe("/account");
    expect(homeFor(as("service_staff"))).toBe("/staff");
    expect(homeFor(as("staff"))).toBe("/staff");
    expect(homeFor(as("admin"))).toBe("/admin");
    expect(homeFor(as("super_admin"))).toBe("/super-admin");
  });
});

describe("safeNextPath", () => {
  it("keeps in-app paths and blocks open redirects", () => {
    expect(safeNextPath("/launch")).toBe("/launch");
    expect(safeNextPath("//evil.example")).toBe("/account");
    expect(safeNextPath("https://evil.example")).toBe("/account");
  });
});
