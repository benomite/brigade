// Le ticket de la déclaration d'essai (#3559) : un projet déjà installé dont la
// branche d'intégration n'a pas de `.brigade/try.json`, et dont le dépôt dit
// comment il s'essaie (`declaration.ts`), reçoit de la cuisine un ticket qui le
// lui ajoute — avec `fire` et son calibrage : la cuisine le sert seule, comme
// tout ticket.
//
// Un seul par projet, jamais deux : son numéro se garde dans l'état du projet
// (`FICHIER`), et noté, plus rien ne part vers GitHub — ni tant qu'il est
// ouvert, ni une fois fermé. La déclaration déjà sur la base, ou un dépôt qui
// ne dit pas comment il s'essaie : aucun ticket. Sa création est annoncée dans
// ce même fichier avant l'appel à GitHub : la réponse perdue, ou la station
// arrêtée entre les deux, l'issue se retrouve par sa marque au lieu d'être
// ouverte deux fois (comme le ticket d'un besoin, `installation/besoins/ticket.ts`).
//
// Branché sur le tick de la cuisine (`station/cuisine.ts`). Une lecture qui
// échoue — la base, le fichier d'état, GitHub — n'ouvre rien, ne réécrit rien,
// se dit, et le tick suivant réessaie.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DE_CONFIANCE } from "../alimenter.ts";
import { LABEL, type GitHub } from "../github.ts";
import type { Runtime } from "../runtime.ts";
import { declarationDesFichiers, FICHIER_D_ESSAI, fichiersDeLaBranche, texteDeLaDeclaration, type Detectee } from "./declaration.ts";

// Dans le répertoire d'état du projet.
export const FICHIER = "declaration-essai.json";

// Écrire un fichier JSON et vérifier que sa commande démarre le projet : un
// ticket court, qui juge peu.
export const LABELS_DE_L_ESSAI = [LABEL, "model:sonnet", "effort:medium"];

// L'issue retrouvée d'une annonce : créée depuis, avec cette marge.
const MARGE_MS = 600_000;

export const marqueDeLEssai = (projet: string) => `<!-- brigade:try-json ${projet} -->`;

export const TITRE = `Declare how the project is tried from a card: \`${FICHIER_D_ESSAI}\``;

export function corpsDeLEssai(projet: string, base: string, { declaration, preuve }: Detectee): string {
  const essayable = !("tryable" in declaration);
  return [
    marqueDeLEssai(projet),
    "",
    "## Context",
    "",
    `The "try it" button of a card runs the delivered version of a ticket with what the project declares in \`${FICHIER_D_ESSAI}\`, at the root of its repository. \`${base}\` has none. The kitchen read the repository (${preuve}) and proposes:`,
    "",
    "```json",
    texteDeLaDeclaration(declaration).trimEnd(),
    "```",
    "",
    `The format: \`{"command": "...", "url": "..."}\` — a shell command run at the root of the repository, and the address it serves (\`url\` is optional) —, or \`{"tryable": false, "reason": "..."}\` for a project that cannot be tried from a card, with a reason a human reads.`,
    "",
    "## Acceptance criteria",
    "",
    `- \`${FICHIER_D_ESSAI}\` is committed at the root of the repository, in one of the two forms above, and it is the only file the delivery changes.`,
    essayable
      ? "- Its `command`, run on the station in a fresh worktree, starts the project, and its `url`, when given, answers once it has started; the report says the command run and the end of what it printed, then stops it. If the proposal does not start the project, the delivery fixes it — or declares the project not tryable, with its reason."
      : "- Its `reason` says, in words a human reads, why the project cannot be tried from a card.",
    "",
    "---",
    "",
    `_Opened by the kitchen because \`${base}\` has no \`${FICHIER_D_ESSAI}\`. Calibrated \`sonnet\` / \`medium\`. One per project: closing it opens no other._`,
  ].join("\n");
}

type Note = { annonceLe: string; ticket?: number };

// Ce que l'état du projet garde du ticket : rien (null), une annonce, un
// ticket. Illisible, il lève : on ne le lit pas vide pour le réécrire.
function lireLaNote(repertoireEtat: string): Note | null {
  let brut: string;
  try {
    brut = readFileSync(join(repertoireEtat, FICHIER), "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw erreur;
  }
  const lu = JSON.parse(brut) as Partial<Note>;
  if (typeof lu !== "object" || lu === null || typeof lu.annonceLe !== "string" || (lu.ticket !== undefined && !(Number.isSafeInteger(lu.ticket) && lu.ticket > 0))) throw new Error(`${FICHIER} is not a note of the kitchen`);
  return lu.ticket === undefined ? { annonceLe: lu.annonceLe } : { annonceLe: lu.annonceLe, ticket: lu.ticket };
}

function noter(repertoireEtat: string, note: Note): void {
  mkdirSync(repertoireEtat, { recursive: true });
  const fichier = join(repertoireEtat, FICHIER);
  writeFileSync(`${fichier}.ecriture`, `${JSON.stringify(note)}\n`);
  renameSync(`${fichier}.ecriture`, fichier);
}

export type BaseDuProjet = {
  base: string;
  // Le contenu d'un fichier de la base ; null s'il n'y est pas. Lève si la base ne se lit pas.
  lire(chemin: string): string | null;
  // Les fichiers suivis de la base. Lève si la base ne se lit pas.
  fichiers(): string[];
};

export type OptionsDuTicketDEssai = {
  projet: string;
  repertoireEtat: string;
  depot: BaseDuProjet;
  github: Pick<GitHub, "creerIssue" | "issuesDepuis">;
  avertir: (ligne: string) => void;
  maintenant?: () => Date;
};

const uneLigne = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur)).split("\n")[0] ?? "";

// Un passage : rend le numéro du ticket et s'il vient d'être ouvert, ou null
// quand il n'y en a pas (pas encore, ou jamais).
export async function passerLeTicketDEssai({ projet, repertoireEtat, depot, github, avertir, maintenant = () => new Date() }: OptionsDuTicketDEssai): Promise<{ ticket: number; ouvert: boolean } | null> {
  let note: Note | null;
  let detectee: Detectee | null;
  try {
    note = lireLaNote(repertoireEtat);
    if (note?.ticket !== undefined) return { ticket: note.ticket, ouvert: false };
    if (depot.lire(FICHIER_D_ESSAI) !== null) return null;
    detectee = declarationDesFichiers(fichiersDeLaBranche(depot.fichiers(), (chemin) => depot.lire(chemin)));
  } catch (erreur) {
    avertir(`try declaration — not read, no ticket opened: ${uneLigne(erreur)}`);
    return null;
  }
  if (detectee === null) return null;
  const marque = marqueDeLEssai(projet);
  try {
    // Annoncé, sans suite : l'issue a peut-être été créée, sa réponse perdue.
    // La marque ne vaut que sur une issue de confiance : n'importe qui peut en ouvrir une qui la porte.
    if (note !== null) {
      const recentes = await github.issuesDepuis(new Date(Date.parse(note.annonceLe) - MARGE_MS).toISOString());
      const retrouvee = recentes.find((issue) => DE_CONFIANCE.includes(issue.association) && issue.body.includes(marque));
      if (retrouvee !== undefined) {
        noter(repertoireEtat, { annonceLe: note.annonceLe, ticket: retrouvee.number });
        return { ticket: retrouvee.number, ouvert: false };
      }
    }
    const annonceLe = maintenant().toISOString();
    noter(repertoireEtat, { annonceLe });
    const ticket = await github.creerIssue({ titre: TITRE, corps: corpsDeLEssai(projet, depot.base, detectee), labels: LABELS_DE_L_ESSAI });
    noter(repertoireEtat, { annonceLe, ticket });
    avertir(`try declaration — #${ticket} opened: ${depot.base} has no ${FICHIER_D_ESSAI}`);
    return { ticket, ouvert: true };
  } catch (erreur) {
    avertir(`try declaration — ticket not opened, retried on the next tick: ${uneLigne(erreur)}`);
    return null;
  }
}

// Le ticket de la déclaration d'essai, à chaque tick du runtime : un passage à la fois.
export function brancherTicketDEssai<R extends Runtime>(runtime: R, options: OptionsDuTicketDEssai): R {
  let enCours = false;
  runtime.surReveil((cause) => {
    if (cause !== "tick" || enCours) return;
    enCours = true;
    void passerLeTicketDEssai(options).finally(() => {
      enCours = false;
    });
  });
  return runtime;
}
