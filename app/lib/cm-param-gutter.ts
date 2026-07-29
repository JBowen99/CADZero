import { gutter, GutterMarker } from "@codemirror/view";
import { RangeSetBuilder, type Extension } from "@uiw/react-codemirror";
import type { BackendName } from "~/types";
import { extractMeta } from "./model-meta";

class ParamToggleMarker extends GutterMarker {
  constructor(
    readonly paramName: string,
    readonly isPublic: boolean,
    readonly onToggle: (name: string) => void,
  ) {
    super();
  }

  eq(other: ParamToggleMarker) {
    return (
      this.paramName === other.paramName &&
      this.isPublic === other.isPublic &&
      this.onToggle === other.onToggle
    );
  }

  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-param-toggle";
    el.style.cssText =
      "cursor:pointer;width:10px;height:14px;display:flex;align-items:center;justify-content:center;font-size:8px;";
    el.textContent = this.isPublic ? "●" : "○";
    el.style.color = this.isPublic
      ? "var(--primary, #eab308)"
      : "var(--muted-foreground, #888)";
    el.title = this.isPublic
      ? "Public parameter — click to hide"
      : "Private — click to expose as parameter";
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onToggle(this.paramName);
    });
    return el;
  }
}

export function paramGutter(
  language: BackendName,
  onToggle: (name: string) => void,
): Extension[] {
  return [
    gutter({
      class: "cm-param-gutter",
      markers: (view) => {
        const code = view.state.doc.toString();
        const meta = extractMeta(code, language);
        const builder = new RangeSetBuilder<ParamToggleMarker>();
        for (const p of meta.params) {
          const lineNum = Math.min(p.line + 1, view.state.doc.lines);
          const pos = view.state.doc.line(lineNum).from;
          builder.add(
            pos,
            pos,
            new ParamToggleMarker(p.name, p.public, onToggle),
          );
        }
        return builder.finish();
      },
    }),
  ];
}
