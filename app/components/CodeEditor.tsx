import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { keymap } from "@codemirror/view";
import { redo, undo } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { cpp } from "@codemirror/lang-cpp";
import { oneDark } from "@codemirror/theme-one-dark";
import type { BackendName } from "~/types";

export type CodeEditorHandle = {
  undo: () => void;
  redo: () => void;
};

interface CodeEditorProps {
  value: string;
  language: BackendName;
  onChange: (code: string) => void;
  onRender?: () => void;
}

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(
  function CodeEditor({ value, language, onChange, onRender }, ref) {
    const { resolvedTheme } = useTheme();
    const cmRef = useRef<ReactCodeMirrorRef>(null);

    useImperativeHandle(
      ref,
      () => ({
        undo: () => {
          const view = cmRef.current?.view;
          if (view) undo(view);
        },
        redo: () => {
          const view = cmRef.current?.view;
          if (view) redo(view);
        },
      }),
      [],
    );

    const extensions = useMemo(() => {
      const lang = language === "openscad" ? cpp() : python();
      const extra = onRender
        ? [
            keymap.of([
              {
                key: "Mod-Enter",
                run: () => {
                  onRender();
                  return true;
                },
              },
            ]),
          ]
        : [];
      return [lang, ...extra];
    }, [language, onRender]);

    return (
      <CodeMirror
        ref={cmRef}
        value={value}
        height="100%"
        theme={resolvedTheme === "dark" ? oneDark : "light"}
        extensions={extensions}
        onChange={onChange}
        style={{ height: "100%", fontSize: "12px" }}
      />
    );
  },
);
