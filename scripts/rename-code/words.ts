// How a name is cut into words, and put back together once some of its words
// are translated. Pure functions: the same name always gives the same result,
// so that a file, its imports and the strings naming it all agree.

export type Style = "camel" | "const" | "kebab";

// One word of a name, as written in it.
type Piece = { text: string; lower: string };

export type Translator = {
  // French word sequences (lower case, space-separated) to English words.
  words: Readonly<Record<string, string>>;
};

const styleOf = (name: string): Style => {
  if (name.includes("-")) return "kebab";
  if (name.includes("_") && !/[a-z]/.test(name)) return "const";
  return "camel";
};

// `connexionMaxDuPoste` → connexion Max Du Poste ; `PLAFOND_DE_COOKS` →
// PLAFOND DE COOKS ; `garde-fous-cli` → garde fous cli. Digits stay with the
// word they follow; acronyms (`PR`, `URL`) stay whole.
const cut = (name: string, style: Style): { lead: string; pieces: Piece[]; tail: string } => {
  const lead = /^[_$#]*/.exec(name)![0];
  const tail = /[_$]*$/.exec(name.slice(lead.length))![0];
  const body = name.slice(lead.length, name.length - tail.length);
  let parts: string[];
  if (style === "kebab") parts = body.split("-");
  else if (style === "const") parts = body.split("_");
  else parts = body.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|[0-9]+|[^A-Za-z0-9]+/g) ?? [body];
  return { lead, tail, pieces: parts.map((text) => ({ text, lower: text.toLowerCase() })) };
};

const caseLike = (model: string, word: string, first: boolean, style: Style): string => {
  if (style === "kebab") return word.toLowerCase();
  if (style === "const") return word.toUpperCase();
  // An all-capital word of more than one letter keeps its capitals (`FAITS` in `lireFAITS` is rare, but kept).
  if (model.length > 1 && model === model.toUpperCase() && /[A-Z]/.test(model)) return word.toUpperCase();
  if (/^[A-Z]/.test(model)) return word.charAt(0).toUpperCase() + word.slice(1);
  return first ? word : word.charAt(0).toUpperCase() + word.slice(1);
};

// The longest French sequence of the table starting at `at`, if any.
const match = (pieces: Piece[], at: number, translator: Translator, longest: number): { length: number; english: string } | undefined => {
  for (let length = Math.min(longest, pieces.length - at); length > 0; length--) {
    const key = pieces.slice(at, at + length).map((piece) => piece.lower).join(" ");
    const english = translator.words[key];
    if (english !== undefined) return { length, english };
  }
  return undefined;
};

// The name with every French sequence of the table replaced by its English
// words, in the name's own style. A name without any is returned as is.
export function translate(name: string, translator: Translator, style: Style = styleOf(name)): string {
  const { lead, tail, pieces } = cut(name, style);
  const longest = Math.max(...Object.keys(translator.words).map((key) => key.split(" ").length));
  const out: string[] = [];
  let changed = false;
  for (let at = 0; at < pieces.length; ) {
    const found = match(pieces, at, translator, longest);
    if (found === undefined) {
      out.push(pieces[at]!.text);
      at += 1;
      continue;
    }
    changed = true;
    const model = pieces[at]!.text;
    found.english.split(" ").forEach((word, index) => out.push(caseLike(index === 0 ? model : "X", word, at === 0 && index === 0, style)));
    at += found.length;
  }
  if (!changed) return name;
  const joined = style === "kebab" ? out.join("-") : style === "const" ? out.join("_") : out.join("");
  return lead + joined + tail;
}

// The French sequences of the table a name still holds, for the check.
export function frenchIn(name: string, translator: Translator, style: Style = styleOf(name)): string[] {
  const { pieces } = cut(name, style);
  const longest = Math.max(...Object.keys(translator.words).map((key) => key.split(" ").length));
  const found: string[] = [];
  for (let at = 0; at < pieces.length; ) {
    const hit = match(pieces, at, translator, longest);
    if (hit === undefined) at += 1;
    else {
      found.push(pieces.slice(at, at + hit.length).map((piece) => piece.lower).join(" "));
      at += hit.length;
    }
  }
  return found;
}
