// The lines the app writes into the station configuration
// (`station/configuration.ts`), through the station: a separate block, between
// two comments, that the station rewrites on its own. What is outside the
// block — the lines the chef wrote by hand — is never touched.
export const START = "# — projets ajoutés depuis l'app : la station réécrit ce bloc seule, ne l'édite pas —";
export const END = "# — fin des projets ajoutés depuis l'app —";

// The text, cut around the block. Without a block, it is all "before".
function split(text: string): { before: string[]; inside: string[]; after: string[] } {
  const lines = text.split("\n");
  const start = lines.indexOf(START);
  const end = start === -1 ? -1 : lines.indexOf(END, start + 1);
  if (start === -1) return { before: lines, inside: [], after: [] };
  // A block with no end runs to the end of the file.
  const stop = end === -1 ? lines.length : end;
  return { before: lines.slice(0, start), inside: lines.slice(start + 1, stop), after: end === -1 ? [] : lines.slice(end + 1) };
}

const useful = (lines: string[]) => lines.map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#"));

// The lines of the block.
export const blockLines = (text: string): string[] => useful(split(text).inside);

// The project names the chef wrote outside the block.
export const namesOutsideBlock = (text: string): string[] => {
  const { before, after } = split(text);
  return useful([...before, ...after]).map((line) => line.split(/\s+/)[0] ?? "");
};

// The text, its block rewritten with these lines, in place. With no lines, the
// block disappears; with no block, it is appended at the end.
export function rewriteBlock(text: string, lines: string[]): string {
  const block = lines.length === 0 ? [] : [START, ...lines, END];
  if (text.split("\n").includes(START)) {
    const { before, after } = split(text);
    // The blank line that separated it from the hand-written lines goes with it.
    if (block.length === 0 && before.at(-1) === "") before.pop();
    const result = [...before, ...block, ...after].join("\n");
    return result.endsWith("\n") || result === "" ? result : `${result}\n`;
  }
  if (block.length === 0) return text;
  const kept = text.replace(/\n*$/, "");
  return `${kept}${kept === "" ? "" : "\n\n"}${block.join("\n")}\n`;
}
