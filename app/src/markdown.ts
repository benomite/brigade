// Le markdown d'une issue, rendu comme GitHub le montre — titres, listes, code, citations, liens,
// tableaux, `<details>` — mais jamais en HTML : en un arbre de blocs et de mots que la vue pose
// élément par élément, chaque texte par `textContent`. Rien de ce qui est écrit sur l'issue ne
// s'exécute dans la vue : une balise que ce module ne connaît pas se lit telle quelle, en texte.
// Les commentaires HTML — les marqueurs du runtime — sont retirés : GitHub ne les montre pas.
// Un retour à la ligne dans un paragraphe en est un, comme dans les commentaires de GitHub.
// Seule une adresse http(s) devient un lien ; les autres restent du texte.

// Ce qui se lit dans une ligne : du texte, du code, de l'emphase, un lien, un retour à la ligne.
export type Mot =
  | { texte: string }
  | { code: string }
  | { gras: Mot[] }
  | { italique: Mot[] }
  | { barre: Mot[] }
  | { lien: string; contenu: Mot[] }
  | { saut: true };

// Un bloc : un titre (son niveau, 1 à 6), un paragraphe, du code (sa langue, si elle est dite), une
// citation, une liste (`debut` : le numéro de son premier élément, si elle est numérotée), un trait,
// un tableau (son en-tête, puis ses lignes, chaque case ses mots), un repli `<details>`.
// `coche` : une case de liste de tâches, cochée ou non.
export type Bloc =
  | { titre: number; contenu: Mot[] }
  | { paragraphe: Mot[] }
  | { code: string; langue?: string }
  | { citation: Bloc[] }
  | { liste: { coche?: boolean; blocs: Bloc[] }[]; debut?: number }
  | { trait: true }
  | { tableau: { tete: Mot[][]; lignes: Mot[][][] } }
  | { replie: { resume: Mot[]; blocs: Bloc[] } };

// Au-delà, une imbrication se lit en texte : une issue ne fait pas tomber la vue.
const PROFONDEUR = 16;

const CLOTURE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/;
const TITRE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const TRAIT = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const CITATION = /^ {0,3}> ?(.*)$/;
const PUCE = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+|$)(.*)$/;
const TACHE = /^\[([ xX])\][ \t]+/;
const OUVRE_DETAILS = /^[ \t]*<details\b[^>]*>/i;
const FERME_DETAILS = /<\/details>[ \t]*$/i;
const RESUME = /^\s*<summary\b[^>]*>([\s\S]*?)<\/summary>[ \t]*/i;
const SEPARATION = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

// Les commentaires HTML, hors des blocs de code : invisibles sur GitHub, ils ne se montrent pas ici.
function sansCommentaires(texte: string): string {
  const lignes = texte.replace(/\r\n?/g, "\n").split("\n");
  const morceaux: string[] = [];
  let prose: string[] = [];
  let cloture: string | undefined;
  const verser = () => {
    if (prose.length > 0) morceaux.push(prose.join("\n").replace(/<!--[\s\S]*?-->/g, ""));
    prose = [];
  };
  for (const ligne of lignes) {
    if (cloture === undefined) {
      const ouvre = CLOTURE.exec(ligne)?.[1];
      if (ouvre === undefined) prose.push(ligne);
      else {
        verser();
        cloture = ouvre;
        morceaux.push(ligne);
      }
    } else {
      morceaux.push(ligne);
      if (ferme(ligne, cloture)) cloture = undefined;
    }
  }
  verser();
  return morceaux.join("\n");
}

const ferme = (ligne: string, cloture: string) => new RegExp(`^ {0,3}${cloture[0] === "`" ? "`" : "~"}{${cloture.length},}[ \\t]*$`).test(ligne);
const vide = (ligne: string) => ligne.trim() === "";
const indentation = (ligne: string) => (/^[ \t]*/.exec(ligne)?.[0] ?? "").replace(/\t/g, "    ").length;
// Retire `n` colonnes d'indentation, une tabulation valant quatre.
function desindenter(ligne: string, n: number): string {
  let colonnes = 0;
  let i = 0;
  while (i < ligne.length && colonnes < n && (ligne[i] === " " || ligne[i] === "\t")) {
    colonnes += ligne[i] === "\t" ? 4 : 1;
    i++;
  }
  return ligne.slice(i);
}

// Une ligne qui ouvre un autre bloc arrête un paragraphe.
const ouvreUnBloc = (ligne: string) => CLOTURE.test(ligne) || TITRE.test(ligne) || TRAIT.test(ligne) || CITATION.test(ligne) || PUCE.test(ligne) || OUVRE_DETAILS.test(ligne);

const cases = (ligne: string): string[] => {
  const coupee = ligne.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  return coupee.split(/(?<!\\)\|/).map((cellule) => cellule.trim().replace(/\\\|/g, "|"));
};

function lireBlocs(lignes: readonly string[], profondeur: number): Bloc[] {
  const blocs: Bloc[] = [];
  let i = 0;
  while (i < lignes.length) {
    const ligne = lignes[i] ?? "";
    if (vide(ligne)) {
      i++;
      continue;
    }
    // Trop profond : le reste se lit en texte, tel qu'il est écrit.
    if (profondeur > PROFONDEUR) {
      blocs.push({ paragraphe: [{ texte: lignes.slice(i).join("\n") }] });
      break;
    }

    const cloture = CLOTURE.exec(ligne);
    if (cloture !== null) {
      const [, ouvre = "```", langue = ""] = cloture;
      const marge = indentation(ligne);
      const code: string[] = [];
      i++;
      while (i < lignes.length && !ferme(lignes[i] ?? "", ouvre)) code.push(desindenter(lignes[i++] ?? "", marge));
      i++;
      blocs.push({ code: code.join("\n"), ...(langue === "" ? {} : { langue }) });
      continue;
    }

    const titre = TITRE.exec(ligne);
    if (titre !== null) {
      blocs.push({ titre: (titre[1] ?? "#").length, contenu: lireMots(titre[2] ?? "") });
      i++;
      continue;
    }

    if (TRAIT.test(ligne)) {
      blocs.push({ trait: true });
      i++;
      continue;
    }

    if (CITATION.test(ligne)) {
      const citees: string[] = [];
      while (i < lignes.length && CITATION.test(lignes[i] ?? "")) citees.push(CITATION.exec(lignes[i++] ?? "")?.[1] ?? "");
      blocs.push({ citation: lireBlocs(citees, profondeur + 1) });
      continue;
    }

    if (OUVRE_DETAILS.test(ligne)) {
      // Jusqu'au `</details>` qui le ferme, les replis imbriqués comptés.
      const dedans: string[] = [];
      let niveau = 0;
      let j = i;
      for (; j < lignes.length; j++) {
        const courante = lignes[j] ?? "";
        niveau += (courante.match(/<details\b/gi) ?? []).length - (courante.match(/<\/details>/gi) ?? []).length;
        dedans.push(courante);
        if (niveau <= 0) break;
      }
      let corps = dedans.join("\n").replace(OUVRE_DETAILS, "");
      if (FERME_DETAILS.test(corps)) corps = corps.replace(FERME_DETAILS, "");
      const resume = RESUME.exec(corps);
      if (resume !== null) corps = corps.slice(resume[0].length);
      blocs.push({ replie: { resume: lireMots((resume?.[1] ?? "Details").trim()), blocs: lireBlocs(corps.split("\n"), profondeur + 1) } });
      i = j + 1;
      continue;
    }

    const puce = PUCE.exec(ligne);
    if (puce !== null) {
      const ordonnee = /\d/.test(puce[2] ?? "");
      const elements: { coche?: boolean; blocs: Bloc[] }[] = [];
      const debut = ordonnee ? Number.parseInt(puce[2] ?? "1", 10) : undefined;
      while (i < lignes.length) {
        const courante = PUCE.exec(lignes[i] ?? "");
        // Une autre sorte de liste en commence une autre.
        if (courante === null || /\d/.test(courante[2] ?? "") !== ordonnee) break;
        const marge = (courante[1] ?? "").length + (courante[2] ?? "").length + Math.min(Math.max((courante[3] ?? "").length, 1), 4);
        const contenu = [courante[4] ?? ""];
        i++;
        while (i < lignes.length) {
          const suivante = lignes[i] ?? "";
          if (vide(suivante)) {
            // Un blanc, puis une ligne en retrait : l'élément continue.
            const apres = lignes.slice(i).findIndex((candidate) => !vide(candidate));
            const reprise = apres === -1 ? undefined : lignes[i + apres];
            if (reprise === undefined || indentation(reprise) < marge) break;
            contenu.push("");
            i++;
            continue;
          }
          if (indentation(suivante) >= marge) contenu.push(desindenter(suivante, marge));
          // Une ligne sans retrait qui n'ouvre rien prolonge le paragraphe de l'élément.
          else if (!ouvreUnBloc(suivante) && !vide(contenu.at(-1) ?? "")) contenu.push(suivante.trimStart());
          else break;
          i++;
        }
        const [premiere = "", ...reste] = contenu;
        const tache = TACHE.exec(premiere);
        const coche = tache === null ? {} : { coche: tache[1] !== " " };
        elements.push({ ...coche, blocs: lireBlocs([tache === null ? premiere : premiere.slice(tache[0].length), ...reste], profondeur + 1) });
        // Un blanc entre deux éléments n'arrête pas la liste.
        while (i < lignes.length && vide(lignes[i] ?? "") && PUCE.test(lignes.slice(i).find((candidate) => !vide(candidate)) ?? "")) i++;
      }
      blocs.push({ liste: elements, ...(debut === undefined ? {} : { debut }) });
      continue;
    }

    // Un tableau : une ligne de cases, puis sa ligne de séparation.
    const separation = lignes[i + 1];
    if (ligne.includes("|") && separation !== undefined && separation.includes("-") && SEPARATION.test(separation)) {
      const tete = cases(ligne).map(lireMots);
      const rangs: Mot[][][] = [];
      i += 2;
      while (i < lignes.length && !vide(lignes[i] ?? "") && (lignes[i] ?? "").includes("|")) rangs.push(cases(lignes[i++] ?? "").map(lireMots));
      blocs.push({ tableau: { tete, lignes: rangs } });
      continue;
    }

    const paragraphe = [ligne.trimStart()];
    i++;
    while (i < lignes.length && !vide(lignes[i] ?? "") && !ouvreUnBloc(lignes[i] ?? "")) paragraphe.push((lignes[i++] ?? "").trimStart());
    blocs.push({ paragraphe: lireMots(paragraphe.join("\n").trimEnd()) });
  }
  return blocs;
}

// Les signes qu'une barre oblique inverse rend à la lettre.
const ECHAPPABLE = /^[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const ADRESSE = /^https?:\/\/[^\s<>]+/i;
const lisible = (url: string) => /^https?:\/\//i.test(url);
const alnum = (signe: string | undefined) => signe !== undefined && /[\p{L}\p{N}]/u.test(signe);

// Une adresse nue s'arrête avant la ponctuation qui la suit, et avant une parenthèse qu'elle n'a pas ouverte.
function adresseNue(texte: string): string | undefined {
  let url = ADRESSE.exec(texte)?.[0];
  if (url === undefined) return undefined;
  for (;;) {
    const derniere = url.at(-1);
    if (derniere !== undefined && ".,:;!?'\"*_~".includes(derniere)) url = url.slice(0, -1);
    else if (derniere === ")" && (url.match(/\(/g) ?? []).length < (url.match(/\)/g) ?? []).length) url = url.slice(0, -1);
    else return url;
  }
}

// `[…](adresse "titre")` à partir de `debut` (sur le `[`) : son contenu, son adresse, et où il finit.
function lienA(texte: string, debut: number): { contenu: string; url: string; fin: number } | undefined {
  let niveau = 0;
  let j = debut;
  for (; j < texte.length; j++) {
    const signe = texte[j];
    if (signe === "\\") j++;
    else if (signe === "[") niveau++;
    else if (signe === "]" && --niveau === 0) break;
  }
  if (j >= texte.length || texte[j + 1] !== "(") return undefined;
  const cible = /^\(\s*<?([^\s()<>]*(?:\([^\s()]*\)[^\s()<>]*)*)>?(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/.exec(texte.slice(j + 1));
  if (cible === null) return undefined;
  return { contenu: texte.slice(debut + 1, j), url: cible[1] ?? "", fin: j + 1 + cible[0].length };
}

// L'emphase qui s'ouvre ici — `**`, `__`, `~~`, `*`, `_` — et où elle se ferme, ou rien.
function emphaseA(texte: string, i: number): { sorte: "gras" | "italique" | "barre"; contenu: string; fin: number } | undefined {
  for (const [signe, sorte] of [["**", "gras"], ["__", "gras"], ["~~", "barre"], ["*", "italique"], ["_", "italique"], ["~", "barre"]] as const) {
    if (!texte.startsWith(signe, i)) continue;
    const dedans = i + signe.length;
    // Au milieu d'un mot, `_` n'ouvre rien (snake_case) ; une emphase ne commence pas par un blanc.
    if (signe[0] === "_" && alnum(texte[i - 1])) return undefined;
    if (/\s/.test(texte[dedans] ?? " ")) return undefined;
    let j = texte.indexOf(signe, dedans + 1);
    // `*` ne se ferme pas sur le premier de `**`.
    while (j !== -1 && signe.length === 1 && texte[j + 1] === signe) j = texte.indexOf(signe, j + 2);
    if (j === -1 || /\s/.test(texte[j - 1] ?? " ")) return undefined;
    if (signe[0] === "_" && alnum(texte[j + signe.length])) return undefined;
    return { sorte, contenu: texte.slice(dedans, j), fin: j + signe.length };
  }
  return undefined;
}

function lireMotsA(texte: string, profondeur: number): Mot[] {
  const mots: Mot[] = [];
  let courant = "";
  const ajouter = (mot: Mot) => {
    if (courant !== "") mots.push({ texte: courant });
    courant = "";
    mots.push(mot);
  };
  let i = 0;
  while (i < texte.length) {
    const signe = texte[i] ?? "";
    const reste = texte.slice(i);
    if (signe === "\\" && texte[i + 1] === "\n") {
      ajouter({ saut: true });
      i += 2;
      continue;
    }
    if (signe === "\\" && ECHAPPABLE.test(texte.slice(i + 1))) {
      courant += texte[i + 1];
      i += 2;
      continue;
    }
    if (signe === "\n") {
      // Les blancs d'avant le retour ne comptent pas.
      courant = courant.trimEnd();
      ajouter({ saut: true });
      i++;
      continue;
    }
    if (signe === "`") {
      const ouverture = /^`+/.exec(reste)?.[0] ?? "`";
      const fin = new RegExp(`(?<!\`)${ouverture}(?!\`)`).exec(texte.slice(i + ouverture.length));
      if (fin === null) {
        courant += ouverture;
        i += ouverture.length;
        continue;
      }
      let code = texte.slice(i + ouverture.length, i + ouverture.length + fin.index).replace(/\n/g, " ");
      if (code.length > 1 && code.startsWith(" ") && code.endsWith(" ") && code.trim() !== "") code = code.slice(1, -1);
      ajouter({ code });
      i += ouverture.length * 2 + fin.index;
      continue;
    }
    if (/^<br\s*\/?>/i.test(reste)) {
      ajouter({ saut: true });
      i += /^<br\s*\/?>/i.exec(reste)?.[0].length ?? 4;
      continue;
    }
    if (signe === "<") {
      const auto = /^<(https?:\/\/[^\s<>]+)>/i.exec(reste);
      if (auto !== null) {
        ajouter({ lien: auto[1] ?? "", contenu: [{ texte: auto[1] ?? "" }] });
        i += auto[0].length;
        continue;
      }
    }
    const image = signe === "!" && texte[i + 1] === "[";
    if (signe === "[" || image) {
      const lien = lienA(texte, image ? i + 1 : i);
      if (lien !== undefined) {
        // Une image n'est pas chargée : elle se dit, et s'ouvre comme un lien.
        const contenu = image ? [{ texte: `image: ${lien.contenu === "" ? lien.url : lien.contenu}` }] : profondeur < PROFONDEUR ? lireMotsA(lien.contenu, profondeur + 1) : [{ texte: lien.contenu }];
        if (lisible(lien.url)) ajouter({ lien: lien.url, contenu });
        // Une adresse qui n'est pas http(s) ne s'ouvre pas : il reste ce que le lien dit.
        else
          for (const mot of contenu) {
            if ("texte" in mot) courant += mot.texte;
            else ajouter(mot);
          }
        i = lien.fin;
        continue;
      }
    }
    if ((signe === "h" || signe === "H") && !alnum(texte[i - 1])) {
      const url = adresseNue(reste);
      if (url !== undefined) {
        ajouter({ lien: url, contenu: [{ texte: url }] });
        i += url.length;
        continue;
      }
    }
    if (signe === "*" || signe === "_" || signe === "~") {
      const emphase = profondeur < PROFONDEUR ? emphaseA(texte, i) : undefined;
      if (emphase !== undefined) {
        const dedans = lireMotsA(emphase.contenu, profondeur + 1);
        ajouter(emphase.sorte === "gras" ? { gras: dedans } : emphase.sorte === "italique" ? { italique: dedans } : { barre: dedans });
        i = emphase.fin;
        continue;
      }
      // Une suite de signes qui n'ouvre rien se lit d'un bloc : aucun ne la relit.
      const suite = /^([*_~])\1*/.exec(reste)?.[0] ?? signe;
      courant += suite;
      i += suite.length;
      continue;
    }
    courant += signe;
    i++;
  }
  if (courant !== "") mots.push({ texte: courant });
  // Deux textes voisins n'en font qu'un.
  return mots.reduce<Mot[]>((fusionnes, mot) => {
    const avant = fusionnes.at(-1);
    if (avant !== undefined && "texte" in avant && "texte" in mot) fusionnes[fusionnes.length - 1] = { texte: avant.texte + mot.texte };
    else fusionnes.push(mot);
    return fusionnes;
  }, []);
}

export const lireMots = (texte: string): Mot[] => lireMotsA(texte, 0);

// Le texte d'une issue ou d'un commentaire, en blocs. Vide — ou fait des seuls marqueurs du
// runtime —, il n'en a aucun.
export function rendre(texte: string): Bloc[] {
  return lireBlocs(sansCommentaires(texte).split("\n"), 0);
}

// Les adresses que ces blocs ouvrent, une fois chacune : celles qu'un clic de la vue peut ouvrir.
export function liensDe(blocs: readonly Bloc[]): string[] {
  const vues = new Set<string>();
  const mots = (liste: readonly Mot[]): void => {
    for (const mot of liste) {
      if ("lien" in mot) vues.add(mot.lien);
      const dedans = "gras" in mot ? mot.gras : "italique" in mot ? mot.italique : "barre" in mot ? mot.barre : "lien" in mot ? mot.contenu : [];
      mots(dedans);
    }
  };
  const parcourir = (liste: readonly Bloc[]): void => {
    for (const bloc of liste) {
      if ("titre" in bloc) mots(bloc.contenu);
      else if ("paragraphe" in bloc) mots(bloc.paragraphe);
      else if ("citation" in bloc) parcourir(bloc.citation);
      else if ("liste" in bloc) for (const element of bloc.liste) parcourir(element.blocs);
      else if ("tableau" in bloc) for (const rang of [bloc.tableau.tete, ...bloc.tableau.lignes]) for (const cellule of rang) mots(cellule);
      else if ("replie" in bloc) {
        mots(bloc.replie.resume);
        parcourir(bloc.replie.blocs);
      }
    }
  };
  parcourir(blocs);
  return [...vues];
}
