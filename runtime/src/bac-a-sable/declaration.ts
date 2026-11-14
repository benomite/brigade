// La déclaration du bac à sable d'un projet : ce que son dépôt demande en plus
// pour ses cooks, dans `.claude/brigade/bac-a-sable.json` —
//
//   {"ports": [5037, 8080], "ecriture": ["~/.gradle", "build-cache"]}
//
// `ports` : les ports TCP que le cook ouvre sur la boucle locale, elle seule
// (un nombre, ou `127.0.0.1:port`, `[::1]:port`, `localhost:port`).
// `ecriture` : des dossiers où il écrit en plus de son worktree — relatifs au
// worktree, absolus, ou sous `~`. Les hôtes restent ceux de `reseau`.
//
// Lue à chaque lancement, sur la branche d'intégration, comme `reseau` et
// `services-locaux`. Ici, seule la forme est jugée : une clé inconnue, un port
// hors de la boucle locale ou de 1-65535, une entrée d'`ecriture` qui n'est
// pas un chemin. Où mène un chemin — sous le worktree, hors des secrets du
// chef et de l'état de Brigade — se juge avec le cook, dans `configuration.ts`.
// Une entrée hors des limites refuse la déclaration entière, et le refus dit
// laquelle et pourquoi.
//
// Pur : rien n'est lu ni écrit.

export const DECLARATION_BAC_A_SABLE = ".claude/brigade/bac-a-sable.json";

export type DeclarationBacASable = { ports: number[]; ecriture: string[] };

export class DeclarationRefusee extends Error {}

const CLES = ["ports", "ecriture"];

// Les adresses de la boucle locale qu'une entrée de `ports` peut nommer.
const BOUCLE = /^(?:127\.0\.0\.1|\[::1\]|localhost):(.*)$/i;

const refus = (entree: string, limite: string) => new DeclarationRefusee(`\`${DECLARATION_BAC_A_SABLE}\`, ${entree} : ${limite} — la déclaration est refusée en entier`);

function port(brut: unknown): number {
  const dit = JSON.stringify(brut);
  let valeur: unknown = brut;
  if (typeof brut === "string") {
    const boucle = BOUCLE.exec(brut.trim());
    if (boucle === null) throw refus(`ports ${dit}`, "un port ne s'ouvre que sur la boucle locale (127.0.0.1, ::1, localhost), jamais sur 0.0.0.0 ni une adresse du réseau");
    valeur = /^[0-9]+$/.test(boucle[1] ?? "") ? Number(boucle[1]) : NaN;
  }
  if (typeof valeur !== "number" || !Number.isSafeInteger(valeur) || valeur < 1 || valeur > 65535) throw refus(`ports ${dit}`, "un port est un entier de 1 à 65535");
  return valeur;
}

function ecriture(brut: unknown): string {
  if (typeof brut !== "string" || brut.trim() === "") throw refus(`ecriture ${JSON.stringify(brut)}`, "un dossier se donne en chemin non vide");
  return brut.trim();
}

// La déclaration d'un dépôt, d'après le contenu de son fichier. Nulle : le
// dépôt n'en a pas — le bac à sable reste celui d'avant. Lève
// `DeclarationRefusee` sur la première entrée hors des limites.
export function lireDeclarationBacASable(texte: string | null | undefined): DeclarationBacASable | null {
  if (texte === null || texte === undefined) return null;
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch (erreur) {
    throw refus("le fichier", `du JSON est attendu (${erreur instanceof Error ? erreur.message : String(erreur)})`);
  }
  if (typeof brut !== "object" || brut === null || Array.isArray(brut)) throw refus("le fichier", "un objet est attendu, avec `ports` et `ecriture`");
  const champs = brut as Record<string, unknown>;
  const inconnue = Object.keys(champs).find((cle) => !CLES.includes(cle));
  if (inconnue !== undefined) throw refus(`la clé « ${inconnue} »`, "clé inconnue — seules `ports` et `ecriture` sont lues");
  for (const cle of CLES) if (champs[cle] !== undefined && !Array.isArray(champs[cle])) throw refus(`la clé « ${cle} »`, "une liste est attendue");
  return {
    ports: [...new Set(((champs.ports ?? []) as unknown[]).map(port))],
    ecriture: [...new Set(((champs.ecriture ?? []) as unknown[]).map(ecriture))],
  };
}
