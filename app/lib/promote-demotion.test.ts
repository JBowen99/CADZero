import { describe, it, expect } from "vitest";
import { toggleParamVisibility } from "./promote-demotion";

describe("toggleParamVisibility — Build123D", () => {
  it("swaps public -> private in the @param annotation", () => {
    const code = [
      "# @param width public min=10 max=200",
      "width = 50.0",
    ].join("\n");
    const out = toggleParamVisibility(code, "width", "build123d");
    expect(out).toContain("# @param width private min=10 max=200");
    expect(out).toContain("width = 50.0");
  });

  it("swaps private -> public", () => {
    const code = [
      "# @param width private",
      "width = 50.0",
    ].join("\n");
    expect(toggleParamVisibility(code, "width", "build123d")).toContain(
      "# @param width public",
    );
  });

  it("is its own inverse (swap twice restores the original)", () => {
    const code = [
      "# @param width public min=10",
      "width = 50.0",
    ].join("\n");
    const once = toggleParamVisibility(code, "width", "build123d");
    const twice = toggleParamVisibility(once, "width", "build123d");
    expect(twice).toBe(code);
  });

  it("is a no-op when the param annotation is absent", () => {
    const code = "width = 50.0";
    expect(toggleParamVisibility(code, "width", "build123d")).toBe(code);
  });
});

describe("toggleParamVisibility — OpenSCAD", () => {
  it("moves a public param under /* [Hidden] */ when one exists", () => {
    const code = [
      "/* [Dimensions] */",
      "width = 50;",
      "/* [Hidden] */",
      "_eps = 0.01;",
    ].join("\n");
    const out = toggleParamVisibility(code, "width", "openscad");
    const hiddenIdx = out.indexOf("/* [Hidden] */");
    const widthIdx = out.indexOf("width = 50;");
    expect(hiddenIdx).toBeGreaterThanOrEqual(0);
    expect(widthIdx).toBeGreaterThan(hiddenIdx);
  });

  it("creates a /* [Hidden] */ header when none exists", () => {
    const code = ["/* [Dimensions] */", "width = 50;"].join("\n");
    const out = toggleParamVisibility(code, "width", "openscad");
    expect(out).toContain("/* [Hidden] */");
    expect(out.indexOf("/* [Hidden] */")).toBeLessThan(
      out.indexOf("width = 50;"),
    );
  });

  it("moves a private param under the first non-hidden section on promote", () => {
    const code = [
      "/* [Hidden] */",
      "_eps = 0.01;",
      "/* [Dimensions] */",
      "outer = 10;",
    ].join("\n");
    const out = toggleParamVisibility(code, "_eps", "openscad");
    const dimIdx = out.indexOf("/* [Dimensions] */");
    const epsIdx = out.indexOf("_eps = 0.01;");
    expect(dimIdx).toBeGreaterThanOrEqual(0);
    expect(epsIdx).toBeGreaterThan(dimIdx);
  });

  it("is a no-op when the named param is not found", () => {
    const code = ["/* [Dimensions] */", "width = 50;"].join("\n");
    expect(toggleParamVisibility(code, "missing", "openscad")).toBe(code);
  });
});

describe("toggleParamVisibility — OpenSCAD empty-section cleanup", () => {
  it("removes the source section once it is emptied", () => {
    const code = ["/* [Dimensions] */", "width = 50;"].join("\n");
    const out = toggleParamVisibility(code, "width", "openscad");
    expect(out).not.toContain("/* [Dimensions] */");
    expect(out).toContain("/* [Hidden] */");
  });

  it("keeps the source section when other params remain in it", () => {
    const code = [
      "/* [Dimensions] */",
      "width = 50;",
      "depth = 30;",
    ].join("\n");
    const out = toggleParamVisibility(code, "width", "openscad");
    expect(out).toContain("/* [Dimensions] */");
    expect(out.indexOf("depth = 30;")).toBeLessThan(
      out.indexOf("/* [Hidden] */"),
    );
  });

  it("removes an emptied section at the top of the file", () => {
    const code = [
      "/* [Dimensions] */",
      "width = 50;",
      "/* [Features] */",
      "holes = 4;",
    ].join("\n");
    const out = toggleParamVisibility(code, "width", "openscad");
    expect(out).not.toContain("/* [Dimensions] */");
    expect(out).toContain("/* [Features] */");
  });

  it("does not leave double blank lines behind", () => {
    const code = ["/* [Dimensions] */", "", "width = 50;"].join("\n");
    const out = toggleParamVisibility(code, "width", "openscad");
    expect(out).not.toMatch(/\n{2,}/);
  });
});
