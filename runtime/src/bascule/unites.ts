// Ce que la bascule lit des unités systemd de l'ancienne installation : une
// unité et ses drop-ins, comme systemd les lit, réduits à ce qui se reprend —
// l'environnement du service, et le nom des autres réglages, pour les dire.
// Rien n'y est évalué par un shell.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Directive = { section: string; cle: string; valeur: string };

// Les directives d'un fichier d'unité, dans l'ordre. Une ligne finie par `\`
// continue sur la suivante ; `#` et `;` ouvrent un commentaire de ligne.
export function lireDirectives(texte: string): Directive[] {
  const directives: Directive[] = [];
  let section = "";
  let suite = "";
  for (const brute of texte.split("\n")) {
    const ligne = suite + brute.trim();
    suite = "";
    if (ligne.endsWith("\\")) {
      suite = `${ligne.slice(0, -1)} `;
      continue;
    }
    if (ligne === "" || ligne.startsWith("#") || ligne.startsWith(";")) continue;
    const entete = /^\[(.+)\]$/.exec(ligne);
    if (entete) {
      section = entete[1] ?? "";
      continue;
    }
    const egal = ligne.indexOf("=");
    if (egal <= 0) continue;
    directives.push({ section, cle: ligne.slice(0, egal).trim(), valeur: ligne.slice(egal + 1).trim() });
  }
  return directives;
}

// Les affectations d'une valeur d'`Environment=` : séparées par des blancs,
// entre guillemets (simples ou doubles) quand elles en contiennent, `\`
// devant ce qui s'échappe.
export function affectations(valeur: string): string[] {
  const mots: string[] = [];
  let mot = "";
  let ouvert = false;
  let guillemet: string | null = null;
  const ECHAPPES: Record<string, string> = { n: "\n", t: "\t", "\\": "\\", '"': '"', "'": "'", " ": " " };
  for (let i = 0; i < valeur.length; i++) {
    const c = valeur[i] ?? "";
    if (c === "\\" && i + 1 < valeur.length) {
      const suivant = valeur[++i] ?? "";
      mot += ECHAPPES[suivant] ?? suivant;
      ouvert = true;
    } else if (guillemet !== null) {
      if (c === guillemet) guillemet = null;
      else mot += c;
    } else if (c === '"' || c === "'") {
      guillemet = c;
      ouvert = true;
    } else if (/\s/.test(c)) {
      if (ouvert) mots.push(mot);
      mot = "";
      ouvert = false;
    } else {
      mot += c;
      ouvert = true;
    }
  }
  if (ouvert) mots.push(mot);
  return mots;
}

// L'environnement que déclarent des directives, dans leur ordre : une
// affectation remplace la précédente, un `Environment=` vide efface tout.
export function environnementDe(directives: Directive[]): Map<string, string> {
  const env = new Map<string, string>();
  for (const { section, cle, valeur } of directives) {
    if (section !== "Service" || cle !== "Environment") continue;
    if (valeur === "") {
      env.clear();
      continue;
    }
    for (const affectation of affectations(valeur)) {
      const egal = affectation.indexOf("=");
      if (egal > 0) env.set(affectation.slice(0, egal), affectation.slice(egal + 1));
    }
  }
  return env;
}

// Les fichiers d'une instance de gabarit, dans l'ordre où systemd les lit : le
// gabarit, puis les drop-ins du gabarit et de l'instance triés par nom — celui
// de l'instance masque celui du gabarit qui porte le même nom.
export function fichiersDeLInstance(unites: string, gabarit: string, instance: string): { gabarit: string; dropins: string[] } {
  const parNom = new Map<string, string>();
  for (const repertoire of [join(unites, `${gabarit}.d`), join(unites, `${instance}.d`)]) {
    if (!existsSync(repertoire)) continue;
    for (const nom of readdirSync(repertoire)) if (nom.endsWith(".conf")) parNom.set(nom, join(repertoire, nom));
  }
  return { gabarit: join(unites, gabarit), dropins: [...parNom.keys()].sort().map((nom) => parNom.get(nom) ?? "") };
}

// Les directives d'un fichier, ses spécificateurs remplacés pour l'instance
// `nom` : `%i` et `%I` (le nom), `%%`. Un autre spécificateur est rendu tel
// quel, et nommé dans `inconnus`.
export function lireAvecInstance(fichier: string, nom: string, inconnus: Set<string>): Directive[] {
  return lireDirectives(readFileSync(fichier, "utf8")).map((directive) => ({
    ...directive,
    valeur: directive.valeur.replace(/%(.)/g, (tout, lettre: string) => {
      if (lettre === "i" || lettre === "I") return nom;
      if (lettre === "%") return "%";
      inconnus.add(tout);
      return tout;
    }),
  }));
}
