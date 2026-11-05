/**
 * Formats a public listing's description for the `JobPosting` structured data.
 *
 * Google Jobs requires the description in HTML and says, at minimum, to add
 * paragraph breaks with `<br>`, `<p>` or `\n`; it recognises `<p>`, `<ul>` and
 * `<li>`. The imported listings are plain text whose bullet runs carry no
 * markup at all — the import pipeline collapses every whitespace run — so the
 * raw value is one long line that Google cannot render as a readable posting.
 *
 * The formatting is a reflow, never a rewrite: the text is escaped and its
 * existing paragraph/bullet boundaries become `<p>`/`<li>`. A value that already
 * contains block markup is passed through untouched.
 */

/** Block-level tags whose presence means the value is already HTML. */
const HTML_BLOCK_TAG = /<(?:p|br|ul|ol|li|div|table|h[1-6])\b/i;

/** The bullet character the imported listings use as their list separator. */
const BULLET = "•";

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Splits a plain-text description into its leading prose and its list items.
 * Lines break on a real newline and on the bullet separator, so both a platform
 * textarea (newlines) and an imported listing (bullets) are handled.
 */
function splitDescriptionLines(value: string): string[] {
  return value
    .replace(/\r\n?/g, "\n")
    .split(BULLET)
    .join(`\n${BULLET}`)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function toJobDescriptionHtml(value: string): string {
  const text = value.trim();
  if (!text) return text;
  if (HTML_BLOCK_TAG.test(text)) return text;

  const lines = splitDescriptionLines(text);
  const prose: string[] = [];
  const items: string[] = [];
  for (const line of lines) {
    if (line.startsWith(BULLET)) {
      const item = line.slice(BULLET.length).trim();
      if (item) items.push(item);
    } else {
      prose.push(line);
    }
  }

  const paragraphs = prose
    .map((line) => `<p>${escapeHtmlText(line)}</p>`)
    .join("");
  const list =
    items.length > 0
      ? `<ul>${items.map((item) => `<li>${escapeHtmlText(item)}</li>`).join("")}</ul>`
      : "";

  // A description that is nothing but bullets still needs the list.
  return paragraphs + list || `<p>${escapeHtmlText(text)}</p>`;
}
