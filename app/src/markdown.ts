// Le markdown d'une issue, rendu comme GitHub le montre — titres, listes, code, citations, liens,
// tableaux, `<details>` — mais jamais en HTML : en un arbre de blocs et de mots que la vue pose
// élément par élément, chaque texte par `textContent`. Rien de ce qui est écrit sur l'issue ne
// s'exécute dans la vue : une balise que ce module ne connaît pas se lit telle quelle, en texte.
// Les commentaires HTML — les marqueurs du runtime — sont retirés : GitHub ne les montre pas.
// Un retour à la ligne dans un paragraphe en est un, comme dans les commentaires de GitHub.
// Seule une adresse http(s) devient un lien ; les autres restent du texte.

// Ce qui se lit dans une ligne : du texte, du code, de l'emphase, un lien, un retour à la ligne.
export type Word =
  | { texte: string }
  | { code: string }
  | { gras: Word[] }
  | { italique: Word[] }
  | { barre: Word[] }
  | { lien: string; contenu: Word[] }
  | { saut: true };

// Un bloc : un titre (son niveau, 1 à 6), un paragraphe, du code (sa langue, si elle est dite), une
// citation, une liste (`debut` : le numéro de son premier élément, si elle est numérotée), un trait,
// un tableau (son en-tête, puis ses lignes, chaque case ses mots), un repli `<details>`.
// `coche` : une case de liste de tâches, cochée ou non.
export type Block =
  | { titre: number; contenu: Word[] }
  | { paragraphe: Word[] }
  | { code: string; langue?: string }
  | { citation: Block[] }
  | { liste: { coche?: boolean; blocs: Block[] }[]; debut?: number }
  | { trait: true }
  | { tableau: { tete: Word[][]; lignes: Word[][][] } }
  | { replie: { resume: Word[]; blocs: Block[] } };

// Au-delà, une imbrication se lit en texte : une issue ne fait pas tomber la vue.
const DEPTH = 16;

const CLOSURE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/;
const TITLE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const TRAIT = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const CITATION = /^ {0,3}> ?(.*)$/;
const BULLET = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+|$)(.*)$/;
const TASK = /^\[([ xX])\][ \t]+/;
const OPENS_DETAILS = /^[ \t]*<details\b[^>]*>/i;
const CLOSES_DETAILS = /<\/details>[ \t]*$/i;
const RESUME = /^\s*<summary\b[^>]*>([\s\S]*?)<\/summary>[ \t]*/i;
const SEPARATION = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

// Les commentaires HTML, hors des blocs de code : invisibles sur GitHub, ils ne se montrent pas ici.
function withoutComments(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const pieces: string[] = [];
  let prose: string[] = [];
  let closure: string | undefined;
  const verser = () => {
    if (prose.length > 0) pieces.push(prose.join("\n").replace(/<!--[\s\S]*?-->/g, ""));
    prose = [];
  };
  for (const line of lines) {
    if (closure === undefined) {
      const opens = CLOSURE.exec(line)?.[1];
      if (opens === undefined) prose.push(line);
      else {
        verser();
        closure = opens;
        pieces.push(line);
      }
    } else {
      pieces.push(line);
      if (closes(line, closure)) closure = undefined;
    }
  }
  verser();
  return pieces.join("\n");
}

const closes = (line: string, closure: string) => new RegExp(`^ {0,3}${closure[0] === "`" ? "`" : "~"}{${closure.length},}[ \\t]*$`).test(line);
const empty = (line: string) => line.trim() === "";
const indentation = (line: string) => (/^[ \t]*/.exec(line)?.[0] ?? "").replace(/\t/g, "    ").length;
// Retire `n` colonnes d'indentation, une tabulation valant quatre.
function desindenter(line: string, n: number): string {
  let columns = 0;
  let i = 0;
  while (i < line.length && columns < n && (line[i] === " " || line[i] === "\t")) {
    columns += line[i] === "\t" ? 4 : 1;
    i++;
  }
  return line.slice(i);
}

// Une ligne qui ouvre un autre bloc arrête un paragraphe.
const opensOneBlock = (line: string) => CLOSURE.test(line) || TITLE.test(line) || TRAIT.test(line) || CITATION.test(line) || BULLET.test(line) || OPENS_DETAILS.test(line);

const cases = (line: string): string[] => {
  const cut = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  return cut.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
};

function readBlocks(lines: readonly string[], depth: number): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (empty(line)) {
      i++;
      continue;
    }
    // Trop profond : le reste se lit en texte, tel qu'il est écrit.
    if (depth > DEPTH) {
      blocks.push({ paragraphe: [{ texte: lines.slice(i).join("\n") }] });
      break;
    }

    const closure = CLOSURE.exec(line);
    if (closure !== null) {
      const [, opens = "```", langue = ""] = closure;
      const margin = indentation(line);
      const code: string[] = [];
      i++;
      while (i < lines.length && !closes(lines[i] ?? "", opens)) code.push(desindenter(lines[i++] ?? "", margin));
      i++;
      blocks.push({ code: code.join("\n"), ...(langue === "" ? {} : { langue }) });
      continue;
    }

    const title = TITLE.exec(line);
    if (title !== null) {
      blocks.push({ titre: (title[1] ?? "#").length, contenu: readWords(title[2] ?? "") });
      i++;
      continue;
    }

    if (TRAIT.test(line)) {
      blocks.push({ trait: true });
      i++;
      continue;
    }

    if (CITATION.test(line)) {
      const cited: string[] = [];
      while (i < lines.length && CITATION.test(lines[i] ?? "")) cited.push(CITATION.exec(lines[i++] ?? "")?.[1] ?? "");
      blocks.push({ citation: readBlocks(cited, depth + 1) });
      continue;
    }

    if (OPENS_DETAILS.test(line)) {
      // Jusqu'au `</details>` qui le ferme, les replis imbriqués comptés.
      const inside: string[] = [];
      let level = 0;
      let j = i;
      for (; j < lines.length; j++) {
        const current = lines[j] ?? "";
        level += (current.match(/<details\b/gi) ?? []).length - (current.match(/<\/details>/gi) ?? []).length;
        inside.push(current);
        if (level <= 0) break;
      }
      let body = inside.join("\n").replace(OPENS_DETAILS, "");
      if (CLOSES_DETAILS.test(body)) body = body.replace(CLOSES_DETAILS, "");
      const resume = RESUME.exec(body);
      if (resume !== null) body = body.slice(resume[0].length);
      blocks.push({ replie: { resume: readWords((resume?.[1] ?? "Details").trim()), blocs: readBlocks(body.split("\n"), depth + 1) } });
      i = j + 1;
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet !== null) {
      const ordinate = /\d/.test(bullet[2] ?? "");
      const elements: { coche?: boolean; blocs: Block[] }[] = [];
      const start = ordinate ? Number.parseInt(bullet[2] ?? "1", 10) : undefined;
      while (i < lines.length) {
        const current = BULLET.exec(lines[i] ?? "");
        // Une autre sorte de liste en commence une autre.
        if (current === null || /\d/.test(current[2] ?? "") !== ordinate) break;
        const margin = (current[1] ?? "").length + (current[2] ?? "").length + Math.min(Math.max((current[3] ?? "").length, 1), 4);
        const content = [current[4] ?? ""];
        i++;
        while (i < lines.length) {
          const next = lines[i] ?? "";
          if (empty(next)) {
            // Un blanc, puis une ligne en retrait : l'élément continue.
            const after = lines.slice(i).findIndex((candidate) => !empty(candidate));
            const resumption = after === -1 ? undefined : lines[i + after];
            if (resumption === undefined || indentation(resumption) < margin) break;
            content.push("");
            i++;
            continue;
          }
          if (indentation(next) >= margin) content.push(desindenter(next, margin));
          // Une ligne sans retrait qui n'ouvre rien prolonge le paragraphe de l'élément.
          else if (!opensOneBlock(next) && !empty(content.at(-1) ?? "")) content.push(next.trimStart());
          else break;
          i++;
        }
        const [first = "", ...remains] = content;
        const task = TASK.exec(first);
        const ticked = task === null ? {} : { coche: task[1] !== " " };
        elements.push({ ...ticked, blocs: readBlocks([task === null ? first : first.slice(task[0].length), ...remains], depth + 1) });
        // Un blanc entre deux éléments n'arrête pas la liste.
        while (i < lines.length && empty(lines[i] ?? "") && BULLET.test(lines.slice(i).find((candidate) => !empty(candidate)) ?? "")) i++;
      }
      blocks.push({ liste: elements, ...(start === undefined ? {} : { debut: start }) });
      continue;
    }

    // Un tableau : une ligne de cases, puis sa ligne de séparation.
    const separation = lines[i + 1];
    if (line.includes("|") && separation !== undefined && separation.includes("-") && SEPARATION.test(separation)) {
      const head = cases(line).map(readWords);
      const ranks: Word[][][] = [];
      i += 2;
      while (i < lines.length && !empty(lines[i] ?? "") && (lines[i] ?? "").includes("|")) ranks.push(cases(lines[i++] ?? "").map(readWords));
      blocks.push({ tableau: { tete: head, lignes: ranks } });
      continue;
    }

    const paragraph = [line.trimStart()];
    i++;
    while (i < lines.length && !empty(lines[i] ?? "") && !opensOneBlock(lines[i] ?? "")) paragraph.push((lines[i++] ?? "").trimStart());
    blocks.push({ paragraphe: readWords(paragraph.join("\n").trimEnd()) });
  }
  return blocks;
}

// Les signes qu'une barre oblique inverse rend à la lettre.
const ESCAPABLE = /^[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const ADDRESS = /^https?:\/\/[^\s<>]+/i;
const readable = (url: string) => /^https?:\/\//i.test(url);
const alnum = (sign: string | undefined) => sign !== undefined && /[\p{L}\p{N}]/u.test(sign);

// Une adresse nue s'arrête avant la ponctuation qui la suit, et avant une parenthèse qu'elle n'a pas ouverte.
function addressBare(text: string): string | undefined {
  let url = ADDRESS.exec(text)?.[0];
  if (url === undefined) return undefined;
  for (;;) {
    const last = url.at(-1);
    if (last !== undefined && ".,:;!?'\"*_~".includes(last)) url = url.slice(0, -1);
    else if (last === ")" && (url.match(/\(/g) ?? []).length < (url.match(/\)/g) ?? []).length) url = url.slice(0, -1);
    else return url;
  }
}

// `[…](adresse "titre")` à partir de `debut` (sur le `[`) : son contenu, son adresse, et où il finit.
function linkA(text: string, start: number): { contenu: string; url: string; fin: number } | undefined {
  let level = 0;
  let j = start;
  for (; j < text.length; j++) {
    const sign = text[j];
    if (sign === "\\") j++;
    else if (sign === "[") level++;
    else if (sign === "]" && --level === 0) break;
  }
  if (j >= text.length || text[j + 1] !== "(") return undefined;
  const target = /^\(\s*<?([^\s()<>]*(?:\([^\s()]*\)[^\s()<>]*)*)>?(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/.exec(text.slice(j + 1));
  if (target === null) return undefined;
  return { contenu: text.slice(start + 1, j), url: target[1] ?? "", fin: j + 1 + target[0].length };
}

// L'emphase qui s'ouvre ici — `**`, `__`, `~~`, `*`, `_` — et où elle se ferme, ou rien.
function emphaseA(text: string, i: number): { sorte: "gras" | "italique" | "barre"; contenu: string; fin: number } | undefined {
  for (const [sign, kind] of [["**", "gras"], ["__", "gras"], ["~~", "barre"], ["*", "italique"], ["_", "italique"], ["~", "barre"]] as const) {
    if (!text.startsWith(sign, i)) continue;
    const inside = i + sign.length;
    // Au milieu d'un mot, `_` n'ouvre rien (snake_case) ; une emphase ne commence pas par un blanc.
    if (sign[0] === "_" && alnum(text[i - 1])) return undefined;
    if (/\s/.test(text[inside] ?? " ")) return undefined;
    let j = text.indexOf(sign, inside + 1);
    // `*` ne se ferme pas sur le premier de `**`.
    while (j !== -1 && sign.length === 1 && text[j + 1] === sign) j = text.indexOf(sign, j + 2);
    if (j === -1 || /\s/.test(text[j - 1] ?? " ")) return undefined;
    if (sign[0] === "_" && alnum(text[j + sign.length])) return undefined;
    return { sorte: kind, contenu: text.slice(inside, j), fin: j + sign.length };
  }
  return undefined;
}

function readWordsA(text: string, depth: number): Word[] {
  const words: Word[] = [];
  let current = "";
  const add = (word: Word) => {
    if (current !== "") words.push({ texte: current });
    current = "";
    words.push(word);
  };
  let i = 0;
  while (i < text.length) {
    const sign = text[i] ?? "";
    const remains = text.slice(i);
    if (sign === "\\" && text[i + 1] === "\n") {
      add({ saut: true });
      i += 2;
      continue;
    }
    if (sign === "\\" && ESCAPABLE.test(text.slice(i + 1))) {
      current += text[i + 1];
      i += 2;
      continue;
    }
    if (sign === "\n") {
      // Les blancs d'avant le retour ne comptent pas.
      current = current.trimEnd();
      add({ saut: true });
      i++;
      continue;
    }
    if (sign === "`") {
      const opening = /^`+/.exec(remains)?.[0] ?? "`";
      const end = new RegExp(`(?<!\`)${opening}(?!\`)`).exec(text.slice(i + opening.length));
      if (end === null) {
        current += opening;
        i += opening.length;
        continue;
      }
      let code = text.slice(i + opening.length, i + opening.length + end.index).replace(/\n/g, " ");
      if (code.length > 1 && code.startsWith(" ") && code.endsWith(" ") && code.trim() !== "") code = code.slice(1, -1);
      add({ code });
      i += opening.length * 2 + end.index;
      continue;
    }
    if (/^<br\s*\/?>/i.test(remains)) {
      add({ saut: true });
      i += /^<br\s*\/?>/i.exec(remains)?.[0].length ?? 4;
      continue;
    }
    if (sign === "<") {
      const auto = /^<(https?:\/\/[^\s<>]+)>/i.exec(remains);
      if (auto !== null) {
        add({ lien: auto[1] ?? "", contenu: [{ texte: auto[1] ?? "" }] });
        i += auto[0].length;
        continue;
      }
    }
    const image = sign === "!" && text[i + 1] === "[";
    if (sign === "[" || image) {
      const link = linkA(text, image ? i + 1 : i);
      if (link !== undefined) {
        // Une image n'est pas chargée : elle se dit, et s'ouvre comme un lien.
        const content = image ? [{ texte: `image: ${link.contenu === "" ? link.url : link.contenu}` }] : depth < DEPTH ? readWordsA(link.contenu, depth + 1) : [{ texte: link.contenu }];
        if (readable(link.url)) add({ lien: link.url, contenu: content });
        // Une adresse qui n'est pas http(s) ne s'ouvre pas : il reste ce que le lien dit.
        else
          for (const word of content) {
            if ("texte" in word) current += word.texte;
            else add(word);
          }
        i = link.fin;
        continue;
      }
    }
    if ((sign === "h" || sign === "H") && !alnum(text[i - 1])) {
      const url = addressBare(remains);
      if (url !== undefined) {
        add({ lien: url, contenu: [{ texte: url }] });
        i += url.length;
        continue;
      }
    }
    if (sign === "*" || sign === "_" || sign === "~") {
      const emphase = depth < DEPTH ? emphaseA(text, i) : undefined;
      if (emphase !== undefined) {
        const inside = readWordsA(emphase.contenu, depth + 1);
        add(emphase.sorte === "gras" ? { gras: inside } : emphase.sorte === "italique" ? { italique: inside } : { barre: inside });
        i = emphase.fin;
        continue;
      }
      // Une suite de signes qui n'ouvre rien se lit d'un bloc : aucun ne la relit.
      const suite = /^([*_~])\1*/.exec(remains)?.[0] ?? sign;
      current += suite;
      i += suite.length;
      continue;
    }
    current += sign;
    i++;
  }
  if (current !== "") words.push({ texte: current });
  // Deux textes voisins n'en font qu'un.
  return words.reduce<Word[]>((fusionnes, word) => {
    const before = fusionnes.at(-1);
    if (before !== undefined && "texte" in before && "texte" in word) fusionnes[fusionnes.length - 1] = { texte: before.texte + word.texte };
    else fusionnes.push(word);
    return fusionnes;
  }, []);
}

export const readWords = (text: string): Word[] => readWordsA(text, 0);

// Le texte d'une issue ou d'un commentaire, en blocs. Vide — ou fait des seuls marqueurs du
// runtime —, il n'en a aucun.
export function render(text: string): Block[] {
  return readBlocks(withoutComments(text).split("\n"), 0);
}

// Les adresses que ces blocs ouvrent, une fois chacune : celles qu'un clic de la vue peut ouvrir.
export function linksOf(blocks: readonly Block[]): string[] {
  const views = new Set<string>();
  const words = (list: readonly Word[]): void => {
    for (const word of list) {
      if ("lien" in word) views.add(word.lien);
      const inside = "gras" in word ? word.gras : "italique" in word ? word.italique : "barre" in word ? word.barre : "lien" in word ? word.contenu : [];
      words(inside);
    }
  };
  const walk = (list: readonly Block[]): void => {
    for (const block of list) {
      if ("titre" in block) words(block.contenu);
      else if ("paragraphe" in block) words(block.paragraphe);
      else if ("citation" in block) walk(block.citation);
      else if ("liste" in block) for (const element of block.liste) walk(element.blocs);
      else if ("tableau" in block) for (const rank of [block.tableau.tete, ...block.tableau.lignes]) for (const cell of rank) words(cell);
      else if ("replie" in block) {
        words(block.replie.resume);
        walk(block.replie.blocs);
      }
    }
  };
  walk(blocks);
  return [...views];
}
