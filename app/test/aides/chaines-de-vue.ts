// Les chaînes d'un fichier de la vue (JS), sans ses commentaires ni ses expressions régulières : ce que l'écran peut dire.
// Un petit lecteur lexical — l'app n'a pas d'analyseur JS —, assez pour séparer commentaire, chaîne, gabarit et regex.
export type Chaine = { texte: string; ligne: number; avant: string };

const DEBUTS_DE_REGEX = new Set(["", "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);

export function chainesDeVue(source: string): Chaine[] {
  const chaines: Chaine[] = [];
  let i = 0;
  let ligne = 1;
  let dernier = ""; // le dernier signe significatif, pour décider si « / » ouvre une regex
  let mot = ""; // le dernier mot, « return » ou « case » ouvrent une regex / une comparaison
  const avant = () => source.slice(Math.max(0, i - 24), i).replace(/\s+/g, " ");

  function lireGabarit(): void {
    // `i` est juste après le « ` » ouvrant ; chaque morceau fixe est une chaîne, chaque ${…} est relu comme du code.
    let morceau = "";
    let debut = ligne;
    const poser = () => {
      if (morceau !== "") chaines.push({ texte: morceau, ligne: debut, avant: "" });
      morceau = "";
    };
    while (i < source.length && source[i] !== "`") {
      if (source[i] === "\\") {
        morceau += source[i + 1] ?? "";
        i += 2;
      } else if (source[i] === "$" && source[i + 1] === "{") {
        poser();
        i += 2;
        lireCode(true);
        debut = ligne;
      } else {
        if (source[i] === "\n") ligne++;
        morceau += source[i];
        i++;
      }
    }
    i++;
    poser();
  }

  function lireCode(dansGabarit: boolean): void {
    let profondeur = 0;
    while (i < source.length) {
      const c = source[i] as string;
      const suite = source[i + 1];
      if (c === "\n") {
        ligne++;
        i++;
      } else if (/\s/.test(c)) {
        i++;
      } else if (c === "/" && suite === "/") {
        while (i < source.length && source[i] !== "\n") i++;
      } else if (c === "/" && suite === "*") {
        const fin = source.indexOf("*/", i + 2);
        const coupe = fin === -1 ? source.length : fin + 2;
        ligne += source.slice(i, coupe).split("\n").length - 1;
        i = coupe;
      } else if (c === '"' || c === "'") {
        const contexte = avant();
        const debut = ligne;
        let texte = "";
        i++;
        while (i < source.length && source[i] !== c) {
          if (source[i] === "\\") {
            texte += source[i + 1] ?? "";
            i += 2;
          } else texte += source[i++];
        }
        i++;
        chaines.push({ texte, ligne: debut, avant: contexte });
        dernier = "a";
        mot = "";
      } else if (c === "`") {
        i++;
        lireGabarit();
        dernier = "a";
        mot = "";
      } else if (c === "/" && (DEBUTS_DE_REGEX.has(dernier) || mot === "return" || mot === "typeof")) {
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
        dernier = "a";
        mot = "";
      } else if (dansGabarit && c === "}" && profondeur === 0) {
        i++;
        return;
      } else {
        if (c === "{") profondeur++;
        if (c === "}") profondeur--;
        if (/[A-Za-z_$]/.test(c)) {
          let fin = i;
          while (/[\w$]/.test(source[fin] ?? "")) fin++;
          mot = source.slice(i, fin);
          i = fin;
          dernier = "a";
        } else if (/[0-9]/.test(c)) {
          i++;
          dernier = "a";
          mot = "";
        } else {
          if (c === ")" || c === "]") dernier = "a";
          else dernier = c;
          mot = "";
          i++;
        }
      }
    }
  }

  lireCode(false);
  return chaines;
}
