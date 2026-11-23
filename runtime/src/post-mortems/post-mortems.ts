// Le post-mortem automatique d'une panne (#4023, spec 2026-11-23-autonomy-trust-control, section T4) : une panne de plus
// de 30 minutes laisse cinq champs — la cause, la durée, qui l'a vue en premier (le système ou le chef), ce qui l'a
// corrigée, le ticket du correctif —, rangés par projet et par panne dans le répertoire d'état. La panne vient des
// événements de panne que le code a déjà (début et fin enregistrés) : rien ici ne détecte une panne de plus.
// « Qui l'a vu en premier » se lit de deux horodatages, jamais d'une saisie : le plus tôt gagne, à égalité le système.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Strictement au-delà : une panne de 30 minutes pile n'en laisse aucun.
export const POST_MORTEM_APRES_MS = 30 * 60_000;

type Panne = {
  id: string;
  debut: string;
  fin: string;
  cause: string;
  // Le premier signe que le système a écrit de la panne, et le premier signe qui en est venu au chef ; nuls quand il n'y en a pas.
  detecteeParLeSysteme: string | null;
  signaleeParLeChef: string | null;
  // Ce qui l'a corrigée et le ticket du correctif ; nuls quand rien ne l'a dit.
  corrigePar: string | null;
  ticketDuCorrectif: string | null;
};

// Les cinq champs, et eux seuls.
export type PostMortem = { cause: string; duree: string; vuEnPremier: "system" | "chef"; corrige: string | null; ticket: string | null };
// Ce que le projet publie : le post-mortem et l'instant où sa panne a fini, d'où la vue les trie et compte sur 7 jours.
export type PostMortemDate = PostMortem & { fin: string };
// Rangé : le post-mortem à ses cinq champs, et la fin de sa panne à côté.
type Rangee = { id: string; fin: string; postMortem: PostMortem };

const chemin = (dossier: string, projet: string) => join(dossier, "post-mortems", `${encodeURIComponent(projet)}.json`);

const instant = (iso: string | null, quoi: string): number | null => {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`${quoi} is not a date: ${iso}`);
  return ms;
};

// Absent, le fichier n'a pas de rangée ; illisible, il est refusé — jamais lu vide puis écrasé.
function lireRangees(dossier: string, projet: string): Rangee[] {
  let brut: string;
  try {
    brut = readFileSync(chemin(dossier, projet), "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw erreur;
  }
  const lu: unknown = JSON.parse(brut);
  if (!Array.isArray(lu)) throw new Error(`the post-mortems of ${projet} are not a list`);
  return lu as Rangee[];
}

export function vuEnPremier(detecteeParLeSysteme: string | null, signaleeParLeChef: string | null): "system" | "chef" {
  const systeme = instant(detecteeParLeSysteme, "the system's first detection");
  const chef = instant(signaleeParLeChef, "the chef's first report");
  if (systeme === null && chef === null) throw new Error("an outage nobody saw has no one who saw it first");
  if (chef === null) return "system";
  if (systeme === null) return "chef";
  return chef < systeme ? "chef" : "system";
}

// La panne qui vient de finir : son post-mortem si elle a duré plus de 30 minutes, nul sinon. La rejouer ne double rien :
// elle rend celui qui est déjà rangé.
export function terminerLaPanne(dossier: string, projet: string, panne: Panne): PostMortem | null {
  const debut = instant(panne.debut, "the start of the outage") as number;
  const fin = instant(panne.fin, "the end of the outage") as number;
  if (fin - debut <= POST_MORTEM_APRES_MS) return null;
  const rangees = lireRangees(dossier, projet);
  const deja = rangees.findIndex(({ id }) => id === panne.id);
  if (deja !== -1) return lirePostMortems(dossier, projet)[deja] as PostMortem;
  const postMortem: PostMortem = {
    cause: panne.cause,
    duree: `${Math.round((fin - debut) / 60_000)} min`,
    vuEnPremier: vuEnPremier(panne.detecteeParLeSysteme, panne.signaleeParLeChef),
    corrige: panne.corrigePar,
    ticket: panne.ticketDuCorrectif,
  };
  mkdirSync(join(dossier, "post-mortems"), { recursive: true });
  const fichier = chemin(dossier, projet);
  writeFileSync(`${fichier}.tmp`, JSON.stringify([...rangees, { id: panne.id, fin: panne.fin, postMortem }]));
  renameSync(`${fichier}.tmp`, fichier);
  return postMortem;
}

// Les post-mortems du projet, dans l'ordre où ils ont été rangés.
export function lirePostMortems(dossier: string, projet: string): PostMortem[] {
  return lireRangees(dossier, projet).map(({ postMortem }) => postMortem);
}

// Les mêmes, chacun avec la fin de sa panne : ce que `facts` publie à la vue du projet.
export function lirePostMortemsDates(dossier: string, projet: string): PostMortemDate[] {
  return lireRangees(dossier, projet).map(({ fin, postMortem }) => ({ ...postMortem, fin }));
}

// `main` rouge, la panne que le superviseur observe déjà (`mainRougeDepuis`, tour.ts) : son début est celui qu'il a noté,
// sa fin le tour qui la voit verte. Le système l'a vue dès son début ; rien ne dit encore quand le chef l'a vue, ni ce
// qui l'a corrigée. Rien n'est tenu d'un process à l'autre, comme le suivi du tour.
export function suivreLaBaseRouge(enregistrer: (panne: Panne) => void): (mainRougeDepuis: string | null, maintenant: Date) => void {
  let enCours: string | null = null;
  return (mainRougeDepuis, maintenant) => {
    if (mainRougeDepuis !== null) {
      enCours ??= mainRougeDepuis;
      return;
    }
    if (enCours === null) return;
    const debut = enCours;
    enCours = null;
    enregistrer({ id: `main-red@${debut}`, debut, fin: maintenant.toISOString(), cause: "main was red", detecteeParLeSysteme: debut, signaleeParLeChef: null, corrigePar: null, ticketDuCorrectif: null });
  };
}
