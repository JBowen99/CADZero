import { describe, it, expect } from "vitest";
import { patchScadParam, formatScadValue } from "./scad-patcher";

describe("formatScadValue", () => {
  it("lowercases booleans", () => {
    expect(formatScadValue(true)).toBe("true");
    expect(formatScadValue(false)).toBe("false");
  });
  it("escapes quotes in strings", () => {
    expect(formatScadValue('a"b')).toBe('"a\\"b"');
  });
  it("stringifies numbers", () => {
    expect(formatScadValue(42)).toBe("42");
    expect(formatScadValue(3.5)).toBe("3.5");
  });
});

describe("patchScadParam", () => {
  it("patches a number and preserves the slider annotation", () => {
    const code = "width = 50; // [10:1:200]";
    expect(patchScadParam(code, "width", 75)).toBe("width = 75; // [10:1:200]");
  });

  it("preserves a plain inline comment", () => {
    const code = "x = 5; // note";
    expect(patchScadParam(code, "x", 9)).toBe("x = 9; // note");
  });

  it("patches a boolean (lowercase)", () => {
    expect(patchScadParam("flag = true;", "flag", false)).toBe("flag = false;");
  });

  it("patches a string with escaping", () => {
    expect(patchScadParam('name = "old";', "name", 'a"b')).toBe(
      'name = "a\\"b";',
    );
  });

  it("only patches top-level (depth 0) assignments", () => {
    const code = [
      "module thing() {",
      "  inner = 5;",
      "}",
      "outer = 10;",
    ].join("\n");
    expect(patchScadParam(code, "inner", 99)).toBe(code);
    expect(patchScadParam(code, "outer", 99)).toContain("outer = 99;");
  });

  it("is a no-op (returns the same string) when the name is absent", () => {
    const code = "width = 50;";
    expect(patchScadParam(code, "missing", 1)).toBe(code);
  });
});
