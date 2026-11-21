/** Keep plain text exact, and give rich editors explicit, nonempty blank lines. */
export function createClipboardContent(text: string): { text: string; html: string } {
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  const html = lines.map((line) => {
    // Some editors discard empty lines on paste, even when represented by <br>.
    if (!line.trim()) return "&nbsp;";
    return line.replace(/[&<>"']/gu, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]!);
  }).join("<br>");
  return { text, html: `<div>${html}</div>` };
}
