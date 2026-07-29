import { describe, it, expect } from "vitest";
import { extractScadMeta } from "./scad-meta";

describe("extractScadMeta", () => {
  it("returns empty meta for empty code", () => {
    expect(extractScadMeta("")).toEqual({ params: [], ops: [] });
    expect(extractScadMeta("   ")).toEqual({ params: [], ops: [] });
  });

  it("extracts a public number param with a slider annotation + desc", () => {
    const code = [
      "/* [Dimensions] */",
      "// Overall width",
      "width = 50; // [10:1:200]",
      "",
      "module foo() cube([width]); // @op:sketch \"Base\"",
    ].join("\n");
    const meta = extractScadMeta(code);
    expect(meta.params).toHaveLength(1);
    expect(meta.params[0]).toMatchObject({
      name: "width",
      value: 50,
      type: "number",
      public: true,
      group: "Dimensions",
      min: 10,
      step: 1,
      max: 200,
      desc: "Overall width",
    });
  });

  it("parses a two-part [min:max] annotation (step inferred)", () => {
    const code = "/* [G] */\nx = 5; // [0:10]";
    const p = extractScadMeta(code).params[0];
    expect(p).toMatchObject({ min: 0, max: 10, step: undefined });
  });

  it("parses a choice annotation into options + type choice", () => {
    const code = "/* [G] */\nmode = \"a\"; // [a,b,c]";
    const p = extractScadMeta(code).params[0];
    expect(p.type).toBe("choice");
    expect(p.options).toEqual(["a", "b", "c"]);
    expect(p.value).toBe("a");
  });

  it("parses booleans and string literals", () => {
    const code = [
      "/* [G] */",
      "flag = true;",
      "name = \"plate\";",
    ].join("\n");
    const { params } = extractScadMeta(code);
    expect(params[0]).toMatchObject({ name: "flag", value: true, type: "bool" });
    expect(params[1]).toMatchObject({ name: "name", value: "plate", type: "string" });
  });

  it("treats a plain literal field as a number/text field (no annotation)", () => {
    const code = "/* [G] */\nheight = 30;";
    const p = extractScadMeta(code).params[0];
    expect(p).toMatchObject({ name: "height", value: 30, type: "number" });
    expect(p.min).toBeUndefined();
    expect(p.max).toBeUndefined();
  });

  it("marks params under /* [Hidden] */ as private with no group", () => {
    const code = "/* [Hidden] */\n_eps = 0.01;";
    const p = extractScadMeta(code).params[0];
    expect(p.public).toBe(false);
    expect(p.group).toBeUndefined();
  });

  it("ignores assignments whose RHS is an expression (non-literal)", () => {
    const code = "/* [G] */\nhalf = width / 2;";
    expect(extractScadMeta(code).params).toHaveLength(0);
  });

  it("ignores params declared inside a module body (depth tracking)", () => {
    const code = [
      "/* [G] */",
      "outer = 10;",
      "module thing() {",
      "  inner = 5;",
      "}",
    ].join("\n");
    const { params } = extractScadMeta(code);
    expect(params.map((p) => p.name)).toEqual(["outer"]);
  });

  it("extracts ops with kind, name, line and captured moduleName", () => {
    const code = [
      "module base_profile() square([10]); // @op:sketch \"Base Profile\"",
      "module with_pad() linear_extrude(8) base_profile(); // @op:extrude \"Pad\"",
      "with_pad(); // @op:final \"Bracket\"",
    ].join("\n");
    const { ops } = extractScadMeta(code);
    expect(ops).toHaveLength(3);
    expect(ops[0]).toMatchObject({
      kind: "sketch",
      name: "Base Profile",
      moduleName: "base_profile",
      line: 0,
    });
    expect(ops[1]).toMatchObject({ kind: "extrude", moduleName: "with_pad" });
    expect(ops[2]).toMatchObject({ kind: "final", moduleName: undefined });
  });

  it("falls back to the raw kind as the op name when no quoted name is given", () => {
    const code = "thing(); // @op:extrude";
    const op = extractScadMeta(code).ops[0];
    expect(op.name).toBe("extrude");
  });

  it("normalizes an unknown op kind to 'other'", () => {
    const code = "thing(); // @op:warp \"Warp\"";
    expect(extractScadMeta(code).ops[0].kind).toBe("other");
  });
});
