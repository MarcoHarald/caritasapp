import {
  computeHoursBetween,
  sanitizeFileName,
  toCsv,
  toIsoStringFromLocal,
} from "@/lib/utils";
import { describe, expect, it } from "vitest";

describe("computeHoursBetween", () => {
  it("calculates decimal hours", () => {
    expect(computeHoursBetween("09:00", "13:30")).toBe(4.5);
  });

  it("returns 0 when end is before start", () => {
    expect(computeHoursBetween("13:00", "09:00")).toBe(0);
  });
});

describe("toIsoStringFromLocal", () => {
  it("returns an ISO string for valid local datetime", () => {
    const value = toIsoStringFromLocal("2026-03-02T14:30");
    expect(new Date(value).toISOString()).toBe(value);
  });
});

describe("toCsv", () => {
  it("escapes commas and quotes", () => {
    const csv = toCsv(
      [{ name: 'A "quoted", value', amount: 10 }],
      ["name", "amount"],
    );

    expect(csv).toContain('"A ""quoted"", value"');
    expect(csv).toContain("name,amount");
  });
});

describe("sanitizeFileName", () => {
  it("replaces unsupported file name characters", () => {
    expect(sanitizeFileName("receipt #1?.jpg")).toBe("receipt__1_.jpg");
  });
});
