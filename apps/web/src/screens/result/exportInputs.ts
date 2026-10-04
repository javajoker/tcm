import type { SavedAssessment } from "../../storage/types.ts";

/** What "Export my inputs" writes: the person's own inputs and the version stamps — never the computed result. Birth data only if it was saved. */
export function inputsExport(saved: SavedAssessment): { readonly format: "tcm-inputs"; readonly version: 1; readonly exportedFrom: Record<string, string>; readonly input: SavedAssessment["input"] } {
  return {
    format: "tcm-inputs", version: 1,
    exportedFrom: { appVersion: saved.appVersion, kbVersion: saved.kbVersion, engineVersion: saved.engineVersion, paramsFingerprint: saved.paramsFingerprint, profile: saved.profile },
    input: saved.input,
  };
}

export const exportFileName = (saved: SavedAssessment): string => `tcm-inputs-${new Date(saved.createdAt).toISOString().slice(0, 10)}.json`;

/** Hands the file to the browser as a download. Nothing is uploaded. */
export function downloadJson(name: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
