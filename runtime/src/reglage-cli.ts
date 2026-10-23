// Les réglages du projet, pour l'app (#1309) : la commande de la box qui les
// montre, et qui en propose le changement par une PR sur le dépôt du projet
// (#1308). L'app ne joint la cuisine d'un projet que par ses commandes —
// `ssh <box> brigade <projet> <commande>`, ou le geste de la station de cet
// ordinateur —, jamais par son état : cette commande est ce passage, et rien
// d'autre. Elle ne pose rien sur la box.
//
//   setting                              les réglages en vigueur, en JSON
//   setting ceiling <model> <effort>     propose ce plafond de calibrage
//   setting manager <model> <effort>     propose ce calibrage par défaut du manager
//   setting reviewer <model> <effort>    … du reviewer
//   setting <ceiling|manager|reviewer> default   propose de le retirer du fichier
//   setting branch <name>                propose cette branche d'intégration
//
// Une proposition passe par `proposerAuRuntime` : le crible de l'écriture
// d'abord — un refus n'écrit rien —, puis la demande au journal du runtime du
// projet, qui ouvre la PR et la remet à la pass. La réponse est une ligne de
// JSON, sous les noms des faits `setting.proposed` et `setting.refused` : la PR
// ouverte, ou pourquoi il n'y en a pas. Le code de sortie est 0 pour une PR
// ouverte, 1 pour un refus dit, 2 pour un usage qui ne se lit pas.
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { decisionsPosees, environnementDecide } from "./decisions.ts";
import { ouvrirJournal } from "./journal.ts";
import { plafondDuProjet } from "./reagir.ts";
import { proposerAuRuntime } from "./reglages-projet/au-runtime.ts";
import { avecLaBrancheDuDepot, brancheDuProjet, reglagesPourMontrer } from "./reglages-projet/en-vigueur.ts";
import { FICHIER, ROLES, type Role } from "./reglages-projet/reglages.ts";

const USAGE =
  "usage: BRIGADE_STATE_DIR=<state directory> BRIGADE_PROJECT=<project> npm --prefix runtime run setting -- [ceiling | manager | reviewer <model> <effort> | default] [branch <name>]";

// Ce que les mots de la commande proposent, sous les noms du fichier — ou null
// s'ils ne se lisent pas. Les valeurs ne sont pas jugées ici : c'est l'écriture
// qui le fait, et son refus qui le dit.
export function changementDesMots(mots: readonly string[]): Record<string, unknown> | null {
  const [quoi, ...reste] = mots;
  if (quoi === "branch") return reste.length === 1 ? { integrationBranch: reste[0] } : null;
  if (quoi !== "ceiling" && !(ROLES as readonly string[]).includes(quoi ?? "")) return null;
  let calibrage: { model: string; effort: string } | null;
  if (reste.length === 1 && reste[0] === "default") calibrage = null;
  else if (reste.length === 2) calibrage = { model: reste[0] as string, effort: reste[1] as string };
  else return null;
  return quoi === "ceiling" ? { calibrationCeiling: calibrage } : { defaultCalibrations: { [quoi as Role]: calibrage } };
}

// D'où vient chaque réglage montré : le fichier du dépôt, la station (sa ligne
// de configuration, ou une décision posée sur la box), le `CLAUDE.md` du
// clone, ou le défaut du runtime.
type Provenance = "repository" | "station" | "CLAUDE.md" | "default";

// Les réglages du projet tels que sa cuisine les applique, et d'où chacun vient.
function enVigueur(env: Record<string, string | undefined>) {
  const reglages = reglagesPourMontrer(env);
  const clone = env.BRIGADE_REPO_DIR;
  const branche = clone ? brancheDuProjet(clone, env.BRIGADE_BASE_BRANCH || null) : null;
  const provenanceDeLaBranche: Record<string, Provenance> = { "projet.json": "repository", configuration: "station", "CLAUDE.md": "CLAUDE.md" };
  const journal = ouvrirJournal(env.BRIGADE_STATE_DIR as string, { lectureSeule: true });
  let posees;
  try {
    posees = decisionsPosees(journal.base);
  } finally {
    journal.fermer();
  }
  const decide = environnementDecide(avecLaBrancheDuDepot(env), posees, reglages);
  const calibrage = (role: Role) => {
    const prefixe = `BRIGADE_${role.toUpperCase()}`;
    const [model, effort] = [decide[`${prefixe}_MODEL`], decide[`${prefixe}_EFFORT`]];
    if (!model || !effort) return null;
    return { model, effort, from: (reglages?.defaultCalibrations?.[role] === undefined ? "station" : "repository") as Provenance };
  };
  const plafond = plafondDuProjet(posees, reglages);
  return {
    file: FICHIER,
    inRepository: reglages !== null,
    integrationBranch: branche?.branche == null ? null : { value: branche.branche, from: branche.provenance === null ? "station" : provenanceDeLaBranche[branche.provenance] },
    defaultCalibrations: Object.fromEntries(ROLES.map((role) => [role, calibrage(role)])),
    calibrationCeiling: { model: plafond.model, effort: plafond.effort, from: (plafond.depot ? "repository" : plafond.pose.model || plafond.pose.effort ? "station" : "default") as Provenance },
  };
}

// `delaiMs` : combien de temps attendre la réponse du runtime — par défaut,
// celui de `proposerAuRuntime`.
export async function principal({ args, env, dire, redire }: Appel, delaiMs?: number): Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade: ${message}`);
    throw new Sortie(code);
  }
  const repertoireEtat = env.BRIGADE_STATE_DIR;
  const projet = env.BRIGADE_PROJECT;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
  if (!projet) echouer(2, `BRIGADE_PROJECT is not set\n${USAGE}`);

  if (args.length === 0) {
    try {
      dire(JSON.stringify(enVigueur(env)));
    } catch (erreur) {
      echouer(1, `the project's settings are not read — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
    return;
  }
  const changement = changementDesMots(args);
  if (changement === null) echouer(2, `“${args.join(" ")}” is not a setting change\n${USAGE}`);
  const reponse = await proposerAuRuntime(changement, { repertoireEtat, projet, auteur: "chef", ...(delaiMs === undefined ? {} : { delaiMs }) });
  if (reponse.ok) {
    dire(JSON.stringify({ ok: true, pr: reponse.pr, number: reponse.numero, branch: reponse.branche, settings: reponse.reglages }));
    return;
  }
  dire(JSON.stringify({ ok: false, reason: reponse.motif, key: reponse.cle, message: reponse.message }));
  throw new Sortie(1);
}

if (import.meta.main) await enProcess(principal);
