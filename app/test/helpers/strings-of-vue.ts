// Les chaînes d'un fichier de la vue (JS), sans ses commentaires ni ses expressions régulières : ce que l'écran peut dire.
// Un petit lecteur lexical — l'app n'a pas d'analyseur JS —, assez pour séparer commentaire, chaîne, gabarit et regex.
export type String = { texte: string; ligne: number; avant: string };

const STARTS_OF_REGEX = new Set(["", "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);

export function stringsOfVue(source: string): String[] {
  const strings: String[] = [];
  let i = 0;
  let line = 1;
  let last = ""; // le dernier signe significatif, pour décider si « / » ouvre une regex
  let word = ""; // le dernier mot, « return » ou « case » ouvrent une regex / une comparaison
  const before = () => source.slice(Math.max(0, i - 24), i).replace(/\s+/g, " ");

  function readTemplate(): void {
    // `i` est juste après le « ` » ouvrant ; chaque morceau fixe est une chaîne, chaque ${…} est relu comme du code.
    let piece = "";
    let start = line;
    const set = () => {
      if (piece !== "") strings.push({ texte: piece, ligne: start, avant: "" });
      piece = "";
    };
    while (i < source.length && source[i] !== "`") {
      if (source[i] === "\\") {
        piece += source[i + 1] ?? "";
        i += 2;
      } else if (source[i] === "$" && source[i + 1] === "{") {
        set();
        i += 2;
        readCode(true);
        start = line;
      } else {
        if (source[i] === "\n") line++;
        piece += source[i];
        i++;
      }
    }
    i++;
    set();
  }

  function readCode(inTemplate: boolean): void {
    let depth = 0;
    while (i < source.length) {
      const c = source[i] as string;
      const suite = source[i + 1];
      if (c === "\n") {
        line++;
        i++;
      } else if (/\s/.test(c)) {
        i++;
      } else if (c === "/" && suite === "/") {
        while (i < source.length && source[i] !== "\n") i++;
      } else if (c === "/" && suite === "*") {
        const end = source.indexOf("*/", i + 2);
        const cut = end === -1 ? source.length : end + 2;
        line += source.slice(i, cut).split("\n").length - 1;
        i = cut;
      } else if (c === '"' || c === "'") {
        const context = before();
        const start = line;
        let text = "";
        i++;
        while (i < source.length && source[i] !== c) {
          if (source[i] === "\\") {
            text += source[i + 1] ?? "";
            i += 2;
          } else text += source[i++];
        }
        i++;
        strings.push({ texte: text, ligne: start, avant: context });
        last = "a";
        word = "";
      } else if (c === "`") {
        i++;
        readTemplate();
        last = "a";
        word = "";
      } else if (c === "/" && (STARTS_OF_REGEX.has(last) || word === "return" || word === "typeof")) {
        i++;
        let classe = false;
        while (i < source.length && (source[i] !== "/" || classe) && source[i] !== "\n") {
          if (source[i] === "\\") i++;
          else if (source[i] === "[") classe = true;
          else if (source[i] === "]") classe = false;
          i++;
        }
        i++;
        while (/[a-z]/.test(source[i] ?? "")) i++;
        last = "a";
        word = "";
      } else if (inTemplate && c === "}" && depth === 0) {
        i++;
        return;
      } else {
        if (c === "{") depth++;
        if (c === "}") depth--;
        if (/[A-Za-z_$]/.test(c)) {
          let end = i;
          while (/[\w$]/.test(source[end] ?? "")) end++;
          word = source.slice(i, end);
          i = end;
          last = "a";
        } else if (/[0-9]/.test(c)) {
          i++;
          last = "a";
          word = "";
        } else {
          if (c === ")" || c === "]") last = "a";
          else last = c;
          word = "";
          i++;
        }
      }
    }
  }

  readCode(false);
  return strings;
}
