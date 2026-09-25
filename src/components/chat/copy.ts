/**
 * Shared clipboard helper for the MAXXEN workspace — used by MessageRow,
 * WorkspacePane and MarkdownLite code cards. Returns true on success.
 */

/** Copies text to the clipboard (with a textarea/execCommand fallback). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    document.body.removeChild(helper);
    return true;
  } catch {
    return false;
  }
}
