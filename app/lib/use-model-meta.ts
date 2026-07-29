import { useMemo } from "react";
import type { ModelMeta } from "~/types";
import { extractMeta } from "./model-meta";
import { useModelStore } from "~/store/useModelStore";

export function useModelMeta(): ModelMeta {
  const cadCode = useModelStore((s) => s.cadCode);
  const language = useModelStore((s) => s.language);
  return useMemo(
    () => extractMeta(cadCode ?? "", language),
    [cadCode, language],
  );
}
