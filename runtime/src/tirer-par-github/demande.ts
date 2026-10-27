// La demande qu'une station secondaire pose sur GitHub, dans le gist où elle
// s'annonce déjà (`appairage/document.ts`) : s'annoncer, réclamer un ticket,
// renouveler le bail de celui qu'elle cuit — ce que le geste `pull` demande par
// ssh (`tirer.ts`), sans ssh —, puis rendre son travail : sa branche, poussée
// sur l'origine, que la principale rapatrie et fait juger par sa pass comme
// celle de tout cook. La principale la lit dans les gists appairés du
// compte et la relaie au journal du projet (`relayer.ts`) ; elle seule décide,
// et sa réponse se publie au Kitchen board (`tableau.ts`).
//
// Un fichier par créneau, écrit par la station seule — `claim` pour réclamer
// ou s'annoncer, `renew.<run>` pour chaque cook qui renouvelle, `deliver.<run>`
// pour chaque cook qui rend son travail —, de sorte que
// deux demandes en même temps n'écrivent jamais le même fichier. Le fichier ne
// porte que la dernière demande de son créneau :
//   brigade-pull.<owner>.<repo>.<créneau>.json
//   { "brigade": "pull", "format": 1, "id": "<uuid>", "depot": "acme/app",
//     "le": "<ISO>", "verb": "claim", "sandbox": { … } }
//   { …, "verb": "renew", "run": "…", "proof": "…", "turns": 3, "tokens": 1200 }
//   { …, "verb": "deliver", "run": "…", "ending": "delivered", "reason": null,
//     "message": "…", "turns": 9, "tokens": 4000 }
// `id` : ce par quoi la station retrouve sa réponse au tableau, et la
// principale ne la relaie qu'une fois. `le` : l'heure où la station l'a posée —
// passé `FRAICHEUR_MS`, plus personne ne l'attend et elle n'est plus relayée.
//
// Le nom de la station n'y est pas : c'est son gist qui la nomme, tel que la
// principale l'a déclarée (`projets/secondaires.ts`).
import type { Fichiers } from "../appairage/canal.ts";
import type { BacASableDeLaStation, Demande } from "../events/remote.ts";

export const PREFIXE = "brigade-pull.";
export const FORMAT = 1;
// Passé ce délai, une demande n'est plus relayée : la station qui la posait a
// cessé d'attendre sa réponse (`demander.ts`, qui attend le double).
export const FRAICHEUR_MS = 5 * 60_000;

// Ce que le gist porte d'une demande : toutes celles de `pull`.
export type DemandeParGitHub = Demande;
export type DemandePosee = { id: string; depot: string; le: string; demande: DemandeParGitHub };

const ID = /^[A-Za-z0-9-]{8,64}$/;
const RUN = /^[A-Za-z0-9._-]{1,80}$/;
const PREUVE_MAX = 200;
// Bornés comme le geste `pull` les borne (`tirer.ts`) : le dernier message d'un
// cook est gardé comme celui d'un cook de la box, un motif est court.
const MESSAGE_MAX = 20_000;
const RAISON_MAX = 200;

const creneau = (demande: DemandeParGitHub) => (demande.verb === "renew" || demande.verb === "deliver" ? `${demande.verb}.${demande.run}` : "claim");

// Le fichier d'une demande, dans le gist de la station.
export const fichierDeLaDemande = (depot: string, demande: DemandeParGitHub): string => `${PREFIXE}${depot.toLowerCase().replace("/", ".")}.${creneau(demande)}.json`;

// Ce que la station écrit dans son gist pour poser cette demande.
export function poserLaDemande(posee: DemandePosee): Fichiers {
  const { id, depot, le, demande } = posee;
  if (!ID.test(id)) throw new Error(`demande « ${id} » : un id de 8 à 64 lettres, chiffres ou tirets`);
  if ((demande.verb === "renew" || demande.verb === "deliver") && !RUN.test(demande.run)) throw new Error(`demande « ${demande.verb} » d'un run illisible : « ${demande.run} »`);
  const bornee =
    demande.verb === "deliver"
      ? { ...demande, message: demande.message?.slice(0, MESSAGE_MAX) ?? null, reason: demande.reason?.slice(0, RAISON_MAX) ?? null }
      : demande.verb === "renew"
        ? { ...demande, proof: demande.proof?.slice(0, PREUVE_MAX) ?? null }
        : demande;
  return { [fichierDeLaDemande(depot, demande)]: JSON.stringify({ brigade: "pull", format: FORMAT, id, depot, le, ...bornee }) };
}

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const compte = (valeur: unknown): valeur is number => Number.isSafeInteger(valeur) && (valeur as number) >= 0;
const texteBorne = (valeur: unknown, max: number): string | null => (typeof valeur === "string" && valeur !== "" ? valeur.slice(0, max) : null);

// Une demande lue, ou null si elle ne se lit pas : la principale ne relaie que
// ce qu'elle comprend, et le runtime juge le reste comme une demande de `pull`.
export function lireUneDemande(brut: string): DemandePosee | null {
  let lu: unknown;
  try {
    lu = JSON.parse(brut);
  } catch {
    return null;
  }
  if (!estObjet(lu) || lu.brigade !== "pull" || lu.format !== FORMAT) return null;
  const { id, depot, le, verb } = lu;
  if (typeof id !== "string" || !ID.test(id) || typeof depot !== "string" || typeof le !== "string" || Number.isNaN(Date.parse(le))) return null;
  const sandbox = estObjet(lu.sandbox) ? { sandbox: lu.sandbox as BacASableDeLaStation } : {};
  if (verb === "announce" || verb === "claim") return { id, depot, le, demande: { verb, ...sandbox } };
  if (verb !== "renew" && verb !== "deliver") return null;
  const { run, turns, tokens } = lu;
  if (typeof run !== "string" || !RUN.test(run) || !compte(turns) || !compte(tokens)) return null;
  if (verb === "renew") return { id, depot, le, demande: { verb, run, proof: texteBorne(lu.proof, PREUVE_MAX), turns, tokens } };
  const { ending } = lu;
  if (ending !== "delivered" && ending !== "failed") return null;
  return { id, depot, le, demande: { verb, run, ending, reason: texteBorne(lu.reason, RAISON_MAX), message: texteBorne(lu.message, MESSAGE_MAX), turns, tokens } };
}

// Les demandes que ce gist pose pour ce dépôt, les plus anciennes d'abord.
export function demandesDuGist(fichiers: Fichiers, depot: string): DemandePosee[] {
  const cible = depot.toLowerCase();
  return Object.entries(fichiers)
    .filter(([nom]) => nom.startsWith(PREFIXE))
    .flatMap(([, brut]) => {
      const lue = lireUneDemande(brut);
      return lue !== null && lue.depot.toLowerCase() === cible ? [lue] : [];
    })
    .sort((a, b) => Date.parse(a.le) - Date.parse(b.le) || a.id.localeCompare(b.id));
}
