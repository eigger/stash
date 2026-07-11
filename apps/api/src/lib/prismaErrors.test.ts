import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { isUniqueConstraintError } from "./prismaErrors.js";

describe("isUniqueConstraintError", () => {
  it("returns true for a Prisma P2002 unique constraint error", () => {
    const err = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "5.22.0",
    });
    expect(isUniqueConstraintError(err)).toBe(true);
  });

  it("returns false for other Prisma error codes", () => {
    const err = new Prisma.PrismaClientKnownRequestError("Record not found", {
      code: "P2025",
      clientVersion: "5.22.0",
    });
    expect(isUniqueConstraintError(err)).toBe(false);
  });

  it("returns false for non-Prisma errors", () => {
    expect(isUniqueConstraintError(new Error("boom"))).toBe(false);
    expect(isUniqueConstraintError(null)).toBe(false);
    expect(isUniqueConstraintError(undefined)).toBe(false);
  });
});
