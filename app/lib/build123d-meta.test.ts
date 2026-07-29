import { describe, it, expect } from "vitest";
import { extractBuild123dMeta } from "./build123d-meta";

describe("extractBuild123dMeta", () => {
  it("returns empty meta for empty code", () => {
    expect(extractBuild123dMeta("")).toEqual({ params: [], ops: [] });
  });

  it("extracts a public param with annotation fields", () => {
    const code = [
      "# @param width public min=10 max=200 step=1 desc=\"Overall width\"",
      "width = 50.0",
    ].join("\n");
    const p = extractBuild123dMeta(code).params[0];
    expect(p).toMatchObject({
      name: "width",
      value: 50,
      type: "number",
      public: true,
      min: 10,
      max: 200,
      step: 1,
      desc: "Overall width",
    });
  });

  it("honors @group sections", () => {
    const code = [
      "# @group Dimensions",
      "# @param width public",
      "width = 50.0",
    ].join("\n");
    expect(extractBuild123dMeta(code).params[0]).toMatchObject({
      group: "Dimensions",
      public: true,
    });
  });

  it("parses options into a choice param", () => {
    const code = [
      "# @param mode public options=\"a,b,c\"",
      "mode = \"a\"",
    ].join("\n");
    const p = extractBuild123dMeta(code).params[0];
    expect(p.type).toBe("choice");
    expect(p.options).toEqual(["a", "b", "c"]);
    expect(p.value).toBe("a");
  });

  it("treats private params as non-public", () => {
    const code = [
      "# @param _eps private",
      "_eps = 0.01",
    ].join("\n");
    const p = extractBuild123dMeta(code).params[0];
    expect(p.public).toBe(false);
  });

  it("parses Python and lowercase booleans", () => {
    const code = [
      "# @param a public",
      "a = True",
      "# @param b public",
      "b = false",
    ].join("\n");
    const { params } = extractBuild123dMeta(code);
    expect(params[0]).toMatchObject({ name: "a", value: true, type: "bool" });
    expect(params[1]).toMatchObject({ name: "b", value: false, type: "bool" });
  });

  it("ignores an indented assignment following @param (only column-0 counts)", () => {
    const code = [
      "# @param width public",
      "    width = 50.0",
    ].join("\n");
    expect(extractBuild123dMeta(code).params).toHaveLength(0);
  });

  it("tolerates a blank line between @param and its assignment", () => {
    const code = [
      "# @param width public",
      "",
      "width = 50.0",
    ].join("\n");
    expect(extractBuild123dMeta(code).params).toHaveLength(1);
  });

  it("drops a param whose RHS is a non-literal expression", () => {
    const code = [
      "# @param half public",
      "half = width / 2",
    ].join("\n");
    expect(extractBuild123dMeta(code).params).toHaveLength(0);
  });

  it("extracts @op markers from builder call lines", () => {
    const code = [
      "with Build() as ctx:",
      "    rectangle(10, 5)            # @op:sketch \"Base\"",
      "    extrude(amount=8)          # @op:extrude \"Pad\"",
    ].join("\n");
    const { ops } = extractBuild123dMeta(code);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ kind: "sketch", name: "Base", line: 1 });
    expect(ops[1]).toMatchObject({ kind: "extrude", name: "Pad", line: 2 });
  });
});
