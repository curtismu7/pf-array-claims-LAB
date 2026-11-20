// The talk-track dialog's script is docs/talk-track.md itself, read at build time (Vite ?raw), so the doc and the dialog cannot drift.
// The doc's shape is the contract (a test fails when it changes): a "One-liner:" line, then "## The walk" as a numbered list of
// "**Title.** text" items, then "## If asked" as a bullet list of "**\"Question?\"** answer" items.
import md from "../../docs/talk-track.md?raw";

const plain = (s) => s.replace(/\*\*/g, "").replace(/`/g, "").trim();

function section(text, heading) {
  const m = text.match(new RegExp(`^## ${heading}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m"));
  return m ? m[1] : "";
}

export function parseTalkTrack(text) {
  const out = [];
  const one = text.match(/^One-liner:\s*"?([^\n]*?)"?\s*$/m);
  if (one) out.push({ id: "one-liner", title: "In one line", say: plain(one[1]) });
  section(text, "The walk").split("\n").forEach((line) => {
    const m = line.match(/^(\d+)\.\s+\*\*(.+?)\*\*\s*(.*)$/);
    if (m) out.push({ id: `walk-${m[1]}`, title: plain(m[2]).replace(/\.$/, ""), say: plain(m[3]) });
  });
  section(text, "If asked").split("\n").forEach((line, i) => {
    const m = line.match(/^-\s+\*\*(.+?)\*\*\s*(.*)$/);
    if (m) out.push({ id: `asked-${i}`, title: plain(m[1]).replace(/^"|"$/g, ""), say: plain(m[2]) });
  });
  return out;
}

export const TALK_TRACK = parseTalkTrack(md);
