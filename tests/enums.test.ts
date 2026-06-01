import { describe, it, expect } from "bun:test";
import { app } from "../src/app";
import {
  getEnums,
  enumLabel,
  isValidEnumValue,
  ENUM_FIELDS,
  EMPLOYMENT_TYPES,
  AVAILABILITY,
  ROLES,
} from "../src/domain/enums";

describe("domain/enums", () => {
  it("derives availability from employment types plus 'busy'", () => {
    for (const t of EMPLOYMENT_TYPES) {
      expect(AVAILABILITY).toContain(t);
    }
    expect(AVAILABILITY).toContain("busy");
    expect(AVAILABILITY.length as number).toBe(EMPLOYMENT_TYPES.length + 1);
  });

  it("includes freelance, contract and internship in availability (regression)", () => {
    expect(AVAILABILITY).toContain("freelance");
    expect(AVAILABILITY).toContain("contract");
    expect(AVAILABILITY).toContain("internship");
  });

  it("localizes labels and falls back to the value / english", () => {
    expect(enumLabel("internship", "it")).toBe("Stage");
    expect(enumLabel("internship", "en")).toBe("Internship");
    expect(enumLabel("internship", "de")).toBe("Praktikum");
    // unknown language falls back to english
    expect(enumLabel("remote", "zz")).toBe("Remote");
    // unknown value falls back to itself
    expect(enumLabel("does-not-exist", "it")).toBe("does-not-exist");
    // default language is english
    expect(enumLabel("admin")).toBe("Admin");
  });

  it("builds a localized option list for every field", () => {
    const enums = getEnums("it");
    for (const field of ENUM_FIELDS) {
      expect(Array.isArray(enums[field])).toBe(true);
      expect(enums[field].length).toBeGreaterThan(0);
      for (const opt of enums[field]) {
        expect(typeof opt.value).toBe("string");
        expect(typeof opt.label).toBe("string");
      }
    }
    expect(enums.role.map((o) => o.value)).toEqual([...ROLES]);
  });

  it("validates membership in a taxonomy", () => {
    expect(isValidEnumValue("seniority", "lead")).toBe(true);
    expect(isValidEnumValue("seniority", "nope")).toBe(false);
    expect(isValidEnumValue("workMode", "onsite")).toBe(true);
  });
});

describe("GET /enums", () => {
  it("returns localized taxonomies for the Accept-Language header", async () => {
    const res = await app.handle(
      new Request("http://localhost/enums", {
        headers: { "accept-language": "it" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.availability.find((o: { value: string }) => o.value === "internship").label).toBe("Stage");
    // every advertised field is present
    for (const field of ENUM_FIELDS) {
      expect(body.data[field]).toBeDefined();
    }
  });

  it("defaults to english without a language header", async () => {
    const res = await app.handle(new Request("http://localhost/enums"));
    const body = await res.json();
    expect(body.data.workMode.find((o: { value: string }) => o.value === "onsite").label).toBe("On-site");
  });
});
