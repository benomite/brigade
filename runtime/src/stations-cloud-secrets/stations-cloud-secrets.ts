// Ce qu'une station du nuage reçoit, et l'accord que l'utilisateur donne une
// fois (#2231, épique #2223). Les secrets de l'utilisateur et sa session Max ne
// quittent jamais sa main : la liste de ce qu'une station reçoit est une
// donnée, dite en clair à l'écran, et rien d'autre ne lui est donné. La liste
// de ce qu'elle ne reçoit jamais s'affiche à côté.
//
// L'accord se donne par projet, sur la liste telle qu'elle est : il en retient
// l'empreinte. Que la liste change — un élément ajouté, retiré, ou dit
// autrement — et l'empreinte ne correspond plus : l'accord ne vaut plus, il se
// redemande.
//
// La charge utile se bâtit par liste blanche : n'en sort que ce que la liste
// nomme. Une valeur qui a la forme d'une session Claude ou d'une clé
// Anthropic, ou qui est celle d'un autre élément disponible, est refusée —
// sous un nom de la liste, ce serait passer en fraude ce qu'elle ne donne pas.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Un élément de la liste : `cle` est son nom dans la charge utile, `dit` ce que
// l'écran en montre à l'utilisateur.
export type Element = { readonly cle: string; readonly dit: string };

export type Liste = { readonly recoit: readonly Element[]; readonly jamais: readonly Element[] };

const figer = (elements: Element[]): readonly Element[] => Object.freeze(elements.map((element) => Object.freeze({ ...element })));

// Ce qu'une station du nuage reçoit, et rien de plus.
export const RECOIT = figer([
  { cle: "depot", dit: "The name of the repository to work on (owner/name), and of no other repository of yours." },
  {
    cle: "jetonGithub",
    dit: "A GitHub token limited to that repository: it lets the station claim its tickets, push its branches, and open, review and merge its pull requests — nothing else on your account.",
  },
]);

// Ce qu'elle ne reçoit jamais, dit à côté pour que l'utilisateur le lise.
export const JAMAIS = figer([
  { cle: "sessionMax", dit: "Your Claude Max session: your login, its token and its quota stay on your machine." },
  { cle: "secretsDuProjet", dit: "The project's development secrets, the values behind `.claude/brigade/secrets`." },
  { cle: "autresJetons", dit: "Any other token or key: your own GitHub login, the GitHub App's private key, tokens for other repositories, API keys." },
  { cle: "machine", dit: "Anything else on your machine: its files, its SSH keys, the kitchen's state and journal." },
]);

export const LISTE: Liste = Object.freeze({ recoit: RECOIT, jamais: JAMAIS });

// La liste en clair, telle que l'écran la montre avant l'accord.
export function enClair(liste: Liste = LISTE): string {
  const lignes = (elements: readonly Element[]) => elements.map((element) => `- ${element.dit}`);
  return ["A cloud station receives:", ...lignes(liste.recoit), "", "It never receives:", ...lignes(liste.jamais)].join("\n");
}

// L'empreinte de la liste : ce que l'accord retient. Les deux listes y entrent,
// dans leur ordre, clés et textes : tout ce qui change à l'écran la change.
export function empreinte(liste: Liste = LISTE): string {
  const canonique = (elements: readonly Element[]) => elements.map(({ cle, dit }) => [cle, dit]);
  return createHash("sha256")
    .update(JSON.stringify({ recoit: canonique(liste.recoit), jamais: canonique(liste.jamais) }))
    .digest("hex");
}

// L'accord d'un projet, gardé dans son répertoire d'état : jamais un secret,
// seulement ce sur quoi il porte et quand il a été donné.
export const FICHIER_ACCORD = "stations-cloud-accord.json";

export type Accord = { projet: string; empreinte: string; au: string };

const cheminAccord = (repertoireEtat: string) => join(repertoireEtat, FICHIER_ACCORD);

// L'accord gardé pour ce répertoire, ou null : absent, illisible ou mal formé,
// il n'y en a pas.
export function lireAccord(repertoireEtat: string): Accord | null {
  const chemin = cheminAccord(repertoireEtat);
  if (!existsSync(chemin)) return null;
  try {
    const lu: unknown = JSON.parse(readFileSync(chemin, "utf8"));
    if (typeof lu !== "object" || lu === null) return null;
    const { projet, empreinte, au } = lu as Record<string, unknown>;
    if (typeof projet !== "string" || typeof empreinte !== "string" || typeof au !== "string") return null;
    return { projet, empreinte, au };
  } catch {
    return null;
  }
}

// L'utilisateur approuve la liste telle qu'elle est, pour ce projet.
export function approuver(repertoireEtat: string, projet: string, liste: Liste = LISTE, maintenant: Date = new Date()): Accord {
  const accord: Accord = { projet, empreinte: empreinte(liste), au: maintenant.toISOString() };
  mkdirSync(repertoireEtat, { recursive: true });
  // Écrit à côté puis renommé : un accord à moitié écrit ne se lit jamais.
  const partiel = `${cheminAccord(repertoireEtat)}.partiel`;
  writeFileSync(partiel, `${JSON.stringify(accord, null, 2)}\n`);
  renameSync(partiel, cheminAccord(repertoireEtat));
  return accord;
}

// L'utilisateur retire son accord : aucune station ne reçoit plus rien.
export function retirerAccord(repertoireEtat: string): void {
  rmSync(cheminAccord(repertoireEtat), { force: true });
}

// Une station de ce projet peut-elle recevoir sa charge utile ? Seulement si
// l'utilisateur a approuvé, pour ce projet, la liste telle qu'elle est.
export function peutRecevoir(repertoireEtat: string, projet: string, liste: Liste = LISTE): boolean {
  const accord = lireAccord(repertoireEtat);
  return accord !== null && accord.projet === projet && accord.empreinte === empreinte(liste);
}

// Ce qui a la forme d'une session Claude ou d'une clé Anthropic : rien de la
// liste ne doit y ressembler.
const FORME_ANTHROPIC = /sk-ant-/;
// `propriétaire/nom`, comme GitHub les écrit.
const DEPOT = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

export type Charge = Readonly<Record<string, string>>;

// `problemes` : pourquoi rien n'est donné — des noms, jamais une valeur.
export type ChargeBatie = { pret: true; charge: Charge } | { pret: false; problemes: string[] };

// La charge utile d'une station, prise dans ce qui est disponible : les seuls
// éléments que la liste nomme. Un élément de la liste qui manque, ou dont la
// valeur est suspecte, et rien n'est donné.
export function chargeUtile(disponible: Readonly<Record<string, string | undefined>>, liste: Liste = LISTE): ChargeBatie {
  const problemes: string[] = [];
  const charge: Record<string, string> = {};
  const nommes = new Set(liste.recoit.map((element) => element.cle));
  // Les valeurs de ce que la liste ne donne pas : aucune ne sort, sous aucun nom.
  const retenues = new Set(
    Object.entries(disponible)
      .filter(([cle, valeur]) => !nommes.has(cle) && typeof valeur === "string" && valeur !== "")
      .map(([, valeur]) => valeur as string),
  );
  for (const { cle } of liste.recoit) {
    const valeur = disponible[cle];
    if (typeof valeur !== "string" || valeur.trim() === "") problemes.push(`\`${cle}\` is missing`);
    else if (FORME_ANTHROPIC.test(valeur)) problemes.push(`\`${cle}\` looks like a Claude session or an Anthropic key, which a station never receives`);
    else if (retenues.has(valeur)) problemes.push(`\`${cle}\` carries the value of something a station never receives`);
    else if (cle === "depot" && !DEPOT.test(valeur)) problemes.push("`depot` is not a repository written owner/name");
    else charge[cle] = valeur;
  }
  if (problemes.length > 0) return { pret: false, problemes };
  return { pret: true, charge: Object.freeze(charge) };
}

// Ce qu'une station de ce projet reçoit, une fois l'accord vérifié : sans
// accord sur la liste telle qu'elle est, rien.
export function chargePourStation(
  repertoireEtat: string,
  projet: string,
  disponible: Readonly<Record<string, string | undefined>>,
  liste: Liste = LISTE,
): ChargeBatie {
  if (!peutRecevoir(repertoireEtat, projet, liste)) {
    return { pret: false, problemes: ["the user has not approved what a cloud station receives, or the list changed since: ask again"] };
  }
  return chargeUtile(disponible, liste);
}
