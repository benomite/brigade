// La lecture d'une commande Bash du cook, assez fine pour la garde : ses
// commandes simples, leurs mots, ce que leurs redirections écrivent, et le
// texte de ses substitutions (`$(…)`, `` `…` ``, `<(…)`), que la garde juge à
// leur tour. Ce n'est pas un shell : ce qu'elle ne sait pas lire — une
// variable inconnue, une substitution à la place d'un mot — reste marqué
// incertain, et la garde refuse un chemin incertain plutôt que de le deviner.

export type Morceau = { lit: string; cite: boolean } | { variable: string } | { substitution: string };
export type Mot = { morceaux: Morceau[]; tilde: boolean };
export type Simple = { mots: Mot[]; ecritures: Mot[] };
export type LectureShell = { commandes: Simple[]; substitutions: string[] };

const NOM = /[A-Za-z0-9_]/;

// Le texte entre `ouvre` et sa fermeture, `debut` juste après l'ouverture ;
// les guillemets y sont sautés. Rend le texte et la place après la fermeture.
function equilibre(texte: string, debut: number, ouvre: string, ferme: string): [string, number] {
  let profondeur = 1;
  let i = debut;
  while (i < texte.length) {
    const c = texte[i];
    if (c === "\\") i += 2;
    else if (c === "'" || c === '"') {
      const fin = texte.indexOf(c, i + 1);
      i = fin === -1 ? texte.length : fin + 1;
    } else {
      if (c === ouvre) profondeur += 1;
      else if (c === ferme) {
        profondeur -= 1;
        if (profondeur === 0) return [texte.slice(debut, i), i + 1];
      }
      i += 1;
    }
  }
  return [texte.slice(debut), texte.length];
}

export function lireShell(texte: string): LectureShell {
  const commandes: Simple[] = [];
  const substitutions: string[] = [];
  let mots: Mot[] = [];
  let ecritures: Mot[] = [];
  let mot: Mot | null = null;
  // Ce que le prochain mot est : la cible d'une écriture, d'une lecture, la
  // fin d'un document en ligne, un descripteur dupliqué.
  let redirection: "ecrit" | "lit" | "document" | "duplique" | null = null;
  let tabulations = false;
  const documents: Array<{ fin: string; tabulations: boolean }> = [];

  const ajouter = (morceau: Morceau) => {
    mot ??= { morceaux: [], tilde: false };
    const dernier = mot.morceaux.at(-1);
    if ("lit" in morceau && dernier !== undefined && "lit" in dernier && dernier.cite === morceau.cite) dernier.lit += morceau.lit;
    else mot.morceaux.push(morceau);
  };
  const finirMot = () => {
    if (mot === null) return;
    if (redirection === "ecrit") ecritures.push(mot);
    else if (redirection === "document") documents.push({ fin: mot.morceaux.map((m) => ("lit" in m ? m.lit : "")).join(""), tabulations });
    else if (redirection === null) mots.push(mot);
    redirection = null;
    mot = null;
  };
  const finirCommande = () => {
    finirMot();
    if (mots.length > 0 || ecritures.length > 0) commandes.push({ mots, ecritures });
    mots = [];
    ecritures = [];
  };
  const substituer = (dedans: string) => {
    substitutions.push(dedans);
    ajouter({ substitution: dedans });
  };
  // `$…`, à la place `i` (sur le `$`) ; rend la place après.
  const dollar = (i: number, cite: boolean): number => {
    const suivant = texte[i + 1];
    if (suivant === "(" && texte[i + 2] === "(") {
      const [, apres] = equilibre(texte, i + 3, "(", ")");
      ajouter({ variable: "" });
      return texte[apres] === ")" ? apres + 1 : apres;
    }
    if (suivant === "(") {
      const [dedans, apres] = equilibre(texte, i + 2, "(", ")");
      substituer(dedans);
      return apres;
    }
    if (suivant === "{") {
      const [dedans, apres] = equilibre(texte, i + 2, "{", "}");
      ajouter({ variable: /^[A-Za-z_][A-Za-z0-9_]*$/.test(dedans) ? dedans : "" });
      return apres;
    }
    if (suivant === "'" && !cite) {
      const fin = texte.indexOf("'", i + 2);
      ajouter({ lit: texte.slice(i + 2, fin === -1 ? texte.length : fin), cite: true });
      return fin === -1 ? texte.length : fin + 1;
    }
    if (suivant !== undefined && /[A-Za-z_]/.test(suivant)) {
      let j = i + 1;
      while (j < texte.length && NOM.test(texte[j] as string)) j += 1;
      ajouter({ variable: texte.slice(i + 1, j) });
      return j;
    }
    if (suivant !== undefined && /[0-9@*#?$!-]/.test(suivant)) {
      ajouter({ variable: "" });
      return i + 2;
    }
    ajouter({ lit: "$", cite });
    return i + 1;
  };
  const accent = (i: number): number => {
    let j = i + 1;
    while (j < texte.length && texte[j] !== "`") j += texte[j] === "\\" ? 2 : 1;
    substituer(texte.slice(i + 1, j));
    return j + 1;
  };
  // Après une fin de ligne : les documents en ligne qu'elle ouvre, sautés.
  const sauterLesDocuments = (i: number): number => {
    while (documents.length > 0) {
      const { fin, tabulations: tabs } = documents.shift() as { fin: string; tabulations: boolean };
      for (;;) {
        if (i >= texte.length) return i;
        const bout = texte.indexOf("\n", i);
        const ligne = texte.slice(i, bout === -1 ? texte.length : bout);
        i = bout === -1 ? texte.length : bout + 1;
        if ((tabs ? ligne.replace(/^\t+/, "") : ligne) === fin) break;
      }
    }
    return i;
  };

  let i = 0;
  while (i < texte.length) {
    const c = texte[i] as string;
    const suivant = texte[i + 1];
    if (c === " " || c === "\t") {
      finirMot();
      i += 1;
    } else if (c === "\n") {
      finirCommande();
      i = sauterLesDocuments(i + 1);
    } else if (c === "#" && mot === null) {
      const bout = texte.indexOf("\n", i);
      i = bout === -1 ? texte.length : bout;
    } else if (c === ";" || c === "|" || c === "(" || c === ")") {
      finirCommande();
      i += 1;
    } else if (c === "&") {
      if (suivant === ">") {
        finirMot();
        redirection = "ecrit";
        i += texte[i + 2] === ">" ? 3 : 2;
      } else {
        finirCommande();
        i += 1;
      }
    } else if ((c === "<" || c === ">") && suivant === "(") {
      finirMot();
      const [dedans, apres] = equilibre(texte, i + 2, "(", ")");
      substitutions.push(dedans);
      i = apres;
    } else if (c === ">") {
      // `2>` : le descripteur n'est pas un mot.
      if (mot !== null && mot.morceaux.length === 1 && "lit" in mot.morceaux[0]! && !mot.morceaux[0].cite && /^\d+$/.test(mot.morceaux[0].lit)) mot = null;
      finirMot();
      i += 1;
      if (texte[i] === ">" || texte[i] === "|") i += 1;
      if (texte[i] === "&" && /[0-9-]/.test(texte[i + 1] ?? "")) {
        redirection = "duplique";
        i += 1;
      } else redirection = "ecrit";
    } else if (c === "<") {
      if (mot !== null && mot.morceaux.length === 1 && "lit" in mot.morceaux[0]! && !mot.morceaux[0].cite && /^\d+$/.test(mot.morceaux[0].lit)) mot = null;
      finirMot();
      if (suivant === "<" && texte[i + 2] === "<") {
        redirection = "lit";
        i += 3;
      } else if (suivant === "<") {
        redirection = "document";
        tabulations = texte[i + 2] === "-";
        i += tabulations ? 3 : 2;
      } else if (suivant === "&") {
        redirection = "duplique";
        i += 2;
      } else {
        redirection = "lit";
        i += 1;
      }
    } else if (c === "\\") {
      if (suivant === "\n") i += 2;
      else {
        if (suivant !== undefined) ajouter({ lit: suivant, cite: true });
        i += 2;
      }
    } else if (c === "'") {
      const fin = texte.indexOf("'", i + 1);
      ajouter({ lit: texte.slice(i + 1, fin === -1 ? texte.length : fin), cite: true });
      i = fin === -1 ? texte.length : fin + 1;
    } else if (c === '"') {
      ajouter({ lit: "", cite: true });
      i += 1;
      while (i < texte.length && texte[i] !== '"') {
        const d = texte[i] as string;
        if (d === "\\" && /[$`"\\\n]/.test(texte[i + 1] ?? "")) {
          if (texte[i + 1] !== "\n") ajouter({ lit: texte[i + 1] as string, cite: true });
          i += 2;
        } else if (d === "$") i = dollar(i, true);
        else if (d === "`") i = accent(i);
        else {
          ajouter({ lit: d, cite: true });
          i += 1;
        }
      }
      i += 1;
    } else if (c === "$") {
      i = dollar(i, false);
    } else if (c === "`") {
      i = accent(i);
    } else if (c === "~" && mot === null && (suivant === undefined || /[\s/;|&)]/.test(suivant))) {
      mot = { morceaux: [], tilde: true };
      i += 1;
    } else {
      ajouter({ lit: c, cite: false });
      i += 1;
    }
  }
  finirCommande();
  return { commandes, substitutions };
}

// Un mot déplié : son texte, s'il est incertain (une variable inconnue, une
// substitution), et la place du premier caractère de motif hors guillemets
// (`*`, `?`, `[`), -1 sans motif.
export type Deplie = { texte: string; incertain: boolean; motif: number };

export function deplier(mot: Mot, variables: Record<string, string | undefined>, home: string | undefined): Deplie {
  let texte = "";
  let incertain = false;
  let motif = -1;
  if (mot.tilde) {
    if (home === undefined) incertain = true;
    else texte = home;
  }
  for (const morceau of mot.morceaux) {
    if ("lit" in morceau) {
      if (!morceau.cite && motif === -1) {
        const place = morceau.lit.search(/[*?[]/);
        if (place !== -1) motif = texte.length + place;
      }
      texte += morceau.lit;
    } else if ("variable" in morceau) {
      const valeur = morceau.variable === "" ? undefined : variables[morceau.variable];
      if (valeur === undefined) incertain = true;
      else texte += valeur;
    } else incertain = true;
  }
  return { texte, incertain, motif };
}
