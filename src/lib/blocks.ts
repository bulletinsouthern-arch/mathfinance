// Lesson pages built from separate blocks in the admin editor.
// Stored in course_sections.content as "BLOCKS:" + JSON so older plain-text pages keep working.
export type Photo = { path: string; caption: string };
export type Block =
  | { id: string; t: "desc"; text: string; photos: Photo[] }
  | { id: string; t: "article"; text: string; photos: Photo[] }
  | { id: string; t: "terms"; title: string; items: { term: string; def: string }[] }
  | { id: string; t: "points"; title: string; items: string[] }
  | { id: string; t: "photo"; path: string; caption: string };

const PREFIX = "BLOCKS:";
export const uid = () => Math.random().toString(36).slice(2, 10);

export function isBlocks(content: string) {
  return content.startsWith(PREFIX);
}

export function parseBlocks(content: string): Block[] {
  if (isBlocks(content)) {
    try {
      const v = JSON.parse(content.slice(PREFIX.length));
      if (Array.isArray(v)) return v as Block[];
    } catch { /* fall through */ }
  }
  // Older pages: first "> " line becomes the description, the rest is one article block.
  const lines = content.replace(/\r/g, "").split("\n");
  const qi = lines.findIndex((l) => l.trim().startsWith("> "));
  const out: Block[] = [];
  if (qi >= 0) {
    out.push({ id: uid(), t: "desc", text: lines[qi]!.trim().slice(2), photos: [] });
    lines.splice(qi, 1);
  }
  const rest = lines.join("\n").trim();
  if (rest) out.push({ id: uid(), t: "article", text: rest, photos: [] });
  return out;
}

export function serializeBlocks(blocks: Block[]) {
  return PREFIX + JSON.stringify(blocks);
}

export function blocksToSpeech(blocks: Block[]) {
  return blocks
    .map((b) => {
      if (b.t === "desc" || b.t === "article") return b.text;
      if (b.t === "terms") return [b.title, ...b.items.map((i) => `${i.term}. ${i.def}`)].join(". ");
      if (b.t === "points") return [b.title, ...b.items].join(". ");
      return "";
    })
    .filter(Boolean)
    .join(". ");
}
