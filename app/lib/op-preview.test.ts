import { describe, it, expect } from "vitest";
import type { OpNode } from "~/types";
import { buildPreviewCode } from "./op-preview";

function op(line: number, overrides: Partial<OpNode> = {}): OpNode {
  return {
    id: `op-${line}`,
    kind: "other",
    rawKind: "other",
    name: "Op",
    order: 0,
    line,
    ...overrides,
  };
}

describe("buildPreviewCode — OpenSCAD", () => {
  it("emits a call to the @op module on its definition line", () => {
    const code =
      'module base_profile() square([10]); // @op:sketch "Base"';
    const out = buildPreviewCode(code, op(0), "openscad");
    expect(out).not.toBeNull();
    expect(out).toContain("module base_profile()");
    expect(out).toContain("base_profile();");
  });

  it("finds the enclosing module for a closing-brace @op marker", () => {
    const code = [
      "module base_profile() square([10]);",
      "module with_pad() {",
      "  linear_extrude(8) base_profile();",
      '} // @op:extrude "Pad"',
    ].join("\n");
    const out = buildPreviewCode(code, op(3), "openscad");
    expect(out).not.toBeNull();
    expect(out).toContain("with_pad();");
  });

  it("returns null when no module can be found", () => {
    const code = 'thing(); // @op:final "X"';
    expect(buildPreviewCode(code, op(0), "openscad")).toBeNull();
  });
});

describe("buildPreviewCode — Build123D", () => {
  const code = [
    "with Build() as ctx:",
    '    rectangle(10, 5)            # @op:sketch "Base"',
    '    extrude(amount=8)          # @op:extrude "Pad"',
    "result = ctx.part",
  ].join("\n");

  it("truncates at the @op line and injects result = ctx.part", () => {
    const out = buildPreviewCode(code, op(2), "build123d");
    expect(out).not.toBeNull();
    expect(out).toContain("extrude(amount=8)");
    expect(out).toContain("result = ctx.part");
  });

  it("skips injection when the kept code already has result =", () => {
    // Previewing the final op (line 3) keeps `result = ctx.part`.
    const out = buildPreviewCode(code, op(3), "build123d");
    expect(out).not.toBeNull();
    expect(out!.match(/result = ctx\.part/g)).toHaveLength(1);
  });

  it("returns null when no build context is present", () => {
    const noCtx = [
      "result = Box(10, 10, 10)",
      '    rectangle(10, 5)  # @op:sketch "Base"',
    ].join("\n");
    expect(buildPreviewCode(noCtx, op(1), "build123d")).toBeNull();
  });

  it("returns null when truncation leaves unbalanced brackets", () => {
    const unbalanced = [
      "with Build() as ctx:",
      '    rectangle(10, # @op:sketch "Base"',
    ].join("\n");
    expect(buildPreviewCode(unbalanced, op(1), "build123d")).toBeNull();
  });

  it("returns null when truncation leaves an unterminated triple-quoted string", () => {
    const unterminated = [
      'with Build() as ctx:',
      '    text("""incomplete  # @op:sketch "Base"',
    ].join("\n");
    expect(buildPreviewCode(unterminated, op(1), "build123d")).toBeNull();
  });

  it("accepts a balanced triple-quoted string in truncated code", () => {
    const balanced = [
      'with Build() as ctx:',
      '    text("""ok""")  # @op:sketch "Base"',
    ].join("\n");
    const out = buildPreviewCode(balanced, op(1), "build123d");
    expect(out).not.toBeNull();
    expect(out).toContain('text("""ok""")');
  });
});
