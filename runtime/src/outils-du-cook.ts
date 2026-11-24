// Les outils d'un cook (#4162, règle 4 de `docs/superpowers/specs/2026-11-24-simplified-process.md`) :
// un cook se spécialise par les outils que le projet offre, pas par un genre de
// cook. Le projet déclare ses outils (`tools` de `.claude/brigade/projet.json`) ;
// le ticket dit ceux qu'il lui faut sur une ligne `Tools: a, b` de son corps.
// Le cook reçoit les outils que le ticket demande ET que le projet déclare ;
// un outil demandé et non déclaré est rapporté, jamais tu. Un ticket sans la
// ligne n'a aucun outil au-delà du défaut (aucun). Sans E/S.
import { dossierDesCaptures } from "./captures.ts";

// Le genre de cook est le même pour tout ticket, avec ou sans outils.
export const GENRE_DE_COOK = "cook";

export const OUTIL_CAPTURES = "screenshots";

const NOM_D_OUTIL = /^[a-z][a-z0-9-]*$/;
const LIGNE = /^[ \t]*Tools[ \t]*:[ \t]*(.*)$/im;

export type OutilsDuCook = {
  genreDeCook: string;
  // Demandés par le ticket et déclarés par le projet.
  outils: string[];
  // Demandés par le ticket, non déclarés par le projet.
  manquants: string[];
  // Dit les manquants, par leur nom ; absent s'il n'en manque aucun.
  message?: string;
};

// Les outils que déclare le contenu de projet.json ; une valeur qui n'est pas une liste n'en déclare aucun.
export function outilsDuProjet(projet: unknown): string[] {
  const tools = typeof projet === "object" && projet !== null ? (projet as { tools?: unknown }).tools : undefined;
  return Array.isArray(tools) ? tools.filter((outil): outil is string => typeof outil === "string") : [];
}

// Les outils que le corps du ticket demande, dans l'ordre, sans doublon.
function outilsDemandes(corpsDuTicket: string): string[] {
  const ligne = LIGNE.exec(corpsDuTicket)?.[1] ?? "";
  const noms = ligne.split(",").map((nom) => nom.trim().toLowerCase().replace(/^`|`$/g, "")).filter((nom) => NOM_D_OUTIL.test(nom));
  return [...new Set(noms)];
}

export function outilsDuCook(demande: { projet: unknown; corpsDuTicket: string }): OutilsDuCook {
  const declares = outilsDuProjet(demande.projet);
  const demandes = outilsDemandes(demande.corpsDuTicket);
  const outils = demandes.filter((outil) => declares.includes(outil));
  const manquants = demandes.filter((outil) => !declares.includes(outil));
  return {
    genreDeCook: GENRE_DE_COOK,
    outils,
    manquants,
    ...(manquants.length === 0 ? {} : { message: `the ticket needs ${manquants.length === 1 ? "a tool" : "tools"} the project does not declare: ${manquants.map((nom) => `\`${nom}\``).join(", ")} — add ${manquants.length === 1 ? "it" : "them"} to \`tools\` in .claude/brigade/projet.json` }),
  };
}

// Ce que le cook lit des outils qu'il reçoit et de ceux qui lui manquent ; vide si le ticket n'en demande aucun.
export function consigneDesOutils(ticket: number, resultat: OutilsDuCook): string {
  const blocs: string[] = [];
  if (resultat.outils.includes(OUTIL_CAPTURES)) blocs.push(`Tool \`${OUTIL_CAPTURES}\`: take the screenshots with \`scripts/capture-ecran/\` (its README says the call) and commit them at \`${dossierDesCaptures(ticket)}/<screen>-avant.png\` and \`${dossierDesCaptures(ticket)}/<screen>-apres.png\`.`);
  const autres = resultat.outils.filter((outil) => outil !== OUTIL_CAPTURES);
  if (autres.length > 0) blocs.push(`Tools the project gives this ticket: ${autres.map((nom) => `\`${nom}\``).join(", ")}.`);
  if (resultat.message !== undefined) blocs.push(`Missing tool: ${resultat.message}. Say it in your report, between \`<bloque>\` and \`</bloque>\`, instead of going without it.`);
  return blocs.length === 0 ? "" : `## Tools\n\n${blocs.join("\n\n")}`;
}
