import { describe, it, expect } from "vitest";
import { patchBuild123dParam, formatBuild123dValue } from "./build123d-patcher";

describe("formatBuild123dValue", () => {
  it("capitalizes booleans (Python)", () => {
    expect(formatBuild123dValue(true)).toBe("True");
    expect(formatBuild123dValue(false)).toBe("False");
  });
  it("escapes quotes in strings", () => {
    expect(formatBuild123dValue('a"b')).toBe('"a\\"b"');
  });
  it("stringifies numbers", () => {
    expect(formatBuild123dValue(80)).toBe("80");
  });
});

describe("patchBuild123dParam", () => {
  it("patches a number", () => {
    expect(patchBuild123dParam("width = 50.0", "width", 80)).toBe(
      "width = 80",
    );
  });

  it("patches a boolean to True/False", () => {
    expect(patchBuild123dParam("flag = True", "flag", false)).toBe(
      "flag = False",
    );
  });

  it("preserves an inline comment with original spacing", () => {
    expect(patchBuild123dParam("width = 50.0  # overall", "width", 80)).toBe(
      "width = 80  # overall",
    );
  });

  it("skips indented assignments", () => {
    const code = "    width = 50.0";
    expect(patchBuild123dParam(code, "width", 80)).toBe(code);
  });

  it("is a no-op when the name is absent", () => {
    const code = "width = 50.0";
    expect(patchBuild123dParam(code, "missing", 1)).toBe(code);
  });
});
