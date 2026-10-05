// Handing a backup to the person and reading one back. Nothing is uploaded: a download, or the system share sheet where the browser offers it.

/** Hands the text to the browser as a download. */
export function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The share sheet's file, where the browser can share one (a phone, mostly); `null` where it cannot. */
export function shareableFile(name: string, text: string): File | null {
  if (typeof File === "undefined" || typeof navigator === "undefined" || typeof navigator.canShare !== "function") return null;
  const file = new File([text], name, { type: "application/json" });
  try { return navigator.canShare({ files: [file] }) ? file : null; } catch { return null; }
}

/** Open the share sheet with a file. `false` when the person closed it or the browser refused. */
export async function shareFile(file: File): Promise<boolean> {
  try { await navigator.share({ files: [file] }); return true; } catch { return false; }
}
