// Proposer un changement des réglages du projet (épique 1301, #1308) : un
// réglage du projet — son plafond de calibrage, par exemple — ne change pas
// sur la box, il change par une PR sur son dépôt, comme le code. Une fois
// mergée, chaque station lit la valeur neuve à son usage suivant
// (`en-vigueur.ts`), sans redémarrer ni `sudo`.
//
// C'est le chemin du carnet des leçons (`promotion/livrer.ts`) : une branche
// préparée sur la base fraîchement rapatriée, un commit qui ne porte que
// `.claude/brigade/projet.json`, poussée, une PR vers la branche
// d'intégration, remise à la pass. La pass la juge comme toute livraison et ne
// la merge jamais elle-même : elle touche aux réglages du projet, et c'est au
// chef de la merger (`pass.ts`, `DECLARATIONS`, #1305).
//
// Le changement est passé au crible de l'écriture (`reglages.ts`) avant que
// rien ne se prépare : une valeur qui est à la machine ou au chef — un
// secret, un chemin, une limite de la machine — ne crée ni branche ni PR, et
// le refus dit laquelle et pourquoi. Rien ici ne merge, et rien n'est poussé
// sur la branche d'intégration.
//
// Les phrases rendues sont en anglais : c'est l'app qui les montre.
import { randomUUID } from "node:crypto";
import type { Calibrage } from "../calibrage.ts";
import type { Depot } from "../depot.ts";
import type { GitHub } from "../github.ts";
import type { LivraisonHorsRail } from "../pass.ts";
import { execFileSync } from "../sans-invite.ts";
import { CLES_DU_CLOSER, ecrireReglagesProjet, FICHIER, lireReglagesProjet, ReglageRefuse, ROLES, validerReglagesProjet, type Motif, type ReglagesProjet } from "./reglages.ts";

// Le run d'une proposition : le nom de sa branche, et celui sous lequel la
// pass la suit.
const PREFIXE = "reglage-";
export const estUnePropositionDeReglage = (run: string): boolean => run.startsWith(PREFIXE);

const IDENTITE = ["-c", "user.name=brigade", "-c", "user.email=brigade@localhost", "-c", "commit.gpgsign=false"];
const DELAI_MS = 60_000;

export type OptionsDeProposition = {
  // Le dépôt de la station : la branche se prépare et se pousse comme celle
  // d'un cook.
  depot: Pick<Depot, "preparer" | "retirer" | "ranger" | "pousser">;
  github: Pick<GitHub, "ouvrirPR" | "prDeBranche">;
  // La branche d'intégration : celle que vise la PR, et celle dont la
  // branche part.
  base: string;
  // La pass qui reçoit la PR (`prendreHorsRail`) : elle la juge, et la retient
  // pour le chef.
  remettre: (livraison: LivraisonHorsRail) => void;
  // L'environnement de `git`. Par défaut, celui du runtime.
  env?: NodeJS.ProcessEnv;
  // Où va ce qui n'empêche pas la PR d'être ouverte (journald).
  avertir?: (message: string) => void;
};

// `ok` : la PR est ouverte et remise à la pass — son adresse, son numéro, sa
// branche, et les réglages qu'elle écrit. Sinon, pourquoi rien n'est proposé :
// un réglage refusé (`motif` de l'écriture, `cle` le réglage), rien qui change
// (`inchange`), ou une étape qui a échoué (`echec`) — et ce qui est resté.
export type Proposition =
  | { ok: true; pr: string; numero: number; branche: string; reglages: ReglagesProjet }
  | { ok: false; motif: Motif | "inchange" | "echec"; cle: string | null; message: string };

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const sortieDeGit = (erreur: unknown) => String((erreur as { stderr?: unknown }).stderr ?? "").trim().split("\n")[0] || message(erreur);
const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);

// Les réglages actuels, changés de ce que la proposition nomme. Un réglage
// nommé remplace l'actuel, `null` le retire ; les calibrages par défaut se
// changent rôle par rôle, les réglages du closer un par un. Ce qui sort n'est pas encore validé : c'est
// l'écriture qui le juge, clés inconnues comprises.
export function appliquerLeChangement(actuels: ReglagesProjet, changement: unknown): Record<string, unknown> {
  if (!estObjet(changement)) throw new ReglageRefuse("invalide", "", "the change must be a JSON object of project settings");
  if (Object.keys(changement).length === 0) throw new ReglageRefuse("invalide", "", "the change names no project setting");
  const change: Record<string, unknown> = { ...actuels };
  for (const [cle, valeur] of Object.entries(changement)) {
    if ((cle === "defaultCalibrations" || cle === "closer") && estObjet(valeur)) {
      const parties: Record<string, unknown> = { ...actuels[cle] };
      for (const [nom, partie] of Object.entries(valeur)) {
        if (partie === null) delete parties[nom];
        else parties[nom] = partie;
      }
      if (Object.keys(parties).length === 0) delete change[cle];
      else change[cle] = parties;
    } else if (valeur === null) delete change[cle];
    else change[cle] = valeur;
  }
  return change;
}

const calibrageDit = (calibrage: Calibrage | undefined) => (calibrage === undefined ? "none" : `${calibrage.model} / ${calibrage.effort}`);
const meme = (a: Calibrage | undefined, b: Calibrage | undefined) => a?.model === b?.model && a?.effort === b?.effort;

// Ce que la proposition change, un réglage par ligne, pour le titre et le
// corps de la PR.
export function changementsDits(avant: ReglagesProjet, apres: ReglagesProjet): string[] {
  const dits: string[] = [];
  if (avant.integrationBranch !== apres.integrationBranch) dits.push(`integration branch: \`${avant.integrationBranch}\` → \`${apres.integrationBranch}\``);
  for (const role of ROLES) {
    const [de, vers] = [avant.defaultCalibrations?.[role], apres.defaultCalibrations?.[role]];
    if (!meme(de, vers)) dits.push(`${role}'s default calibration: ${calibrageDit(de)} → ${calibrageDit(vers)}`);
  }
  if (!meme(avant.calibrationCeiling, apres.calibrationCeiling)) dits.push(`calibration ceiling: ${calibrageDit(avant.calibrationCeiling)} → ${calibrageDit(apres.calibrationCeiling)}`);
  if (!meme(avant.closer?.calibration, apres.closer?.calibration)) dits.push(`closer's calibration: ${calibrageDit(avant.closer?.calibration)} → ${calibrageDit(apres.closer?.calibration)}`);
  for (const nom of CLES_DU_CLOSER) {
    if (nom === "calibration") continue;
    const [de, vers] = [avant.closer?.[nom], apres.closer?.[nom]];
    if (de !== vers) dits.push(`closer's \`${nom}\`: ${de ?? "none"} → ${vers ?? "none"}`);
  }
  return dits;
}

const refus = (erreur: ReglageRefuse): Proposition => ({ ok: false, motif: erreur.motif, cle: erreur.cle === "" ? null : erreur.cle, message: erreur.message });
const echec = (texte: string): Proposition => ({ ok: false, motif: "echec", cle: null, message: texte });

// Le crible du seul changement, sans rien lire ni préparer : le refus que
// l'écriture lui opposerait sur une base qui ne porterait que `base`, ou null.
export function refusDuChangement(changement: unknown, base: string): Extract<Proposition, { ok: false }> | null {
  try {
    validerReglagesProjet(appliquerLeChangement({ integrationBranch: base }, changement));
    return null;
  } catch (erreur) {
    if (erreur instanceof ReglageRefuse) return refus(erreur) as Extract<Proposition, { ok: false }>;
    throw erreur;
  }
}

// Propose le changement des réglages du projet par une PR sur son dépôt.
// `changement` : ce que l'app envoie, rien n'y est cru sur parole — les
// réglages qu'il nomme, sous les noms du fichier (`calibrationCeiling`,
// `defaultCalibrations.manager`, `integrationBranch`, `closer.maxTokens`),
// `null` pour en retirer un. Ne lève pas : ce qui n'est pas proposé le dit.
export async function proposerUnReglage(changement: unknown, options: OptionsDeProposition): Promise<Proposition> {
  const { depot, github, base } = options;
  const env = options.env ?? process.env;
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));

  // Le crible d'abord, sur le seul changement : un refus ne prépare rien.
  const refuse = refusDuChangement(changement, base);
  if (refuse !== null) return refuse;

  const run = `${PREFIXE}${randomUUID().slice(0, 8)}`;
  let worktree: string;
  let branche: string;
  try {
    ({ worktree, branche } = await depot.preparer(run));
  } catch (erreur) {
    return echec(`The branch for this change could not be prepared from \`${base}\`: ${message(erreur)}`);
  }

  // Les réglages que la base porte, fraîchement rapatriée : c'est sur eux que
  // le changement s'applique, et eux seuls que la PR change.
  let avant: ReglagesProjet;
  let apres: ReglagesProjet;
  try {
    const lus = await lireReglagesProjet(worktree);
    avant = {
      integrationBranch: lus.integrationBranch ?? base,
      ...(Object.keys(lus.defaultCalibrations).length === 0 ? {} : { defaultCalibrations: lus.defaultCalibrations }),
      ...(lus.calibrationCeiling === null ? {} : { calibrationCeiling: lus.calibrationCeiling }),
      ...(Object.keys(lus.closer).length === 0 ? {} : { closer: lus.closer }),
    };
    apres = validerReglagesProjet(appliquerLeChangement(avant, changement));
    if (changementsDits(avant, apres).length === 0) {
      depot.retirer(worktree, branche);
      return { ok: false, motif: "inchange", cle: null, message: `\`${base}\` already carries these project settings: there is nothing to propose.` };
    }
    ecrireReglagesProjet(worktree, apres);
  } catch (erreur) {
    depot.retirer(worktree, branche);
    if (erreur instanceof ReglageRefuse) return refus(erreur);
    return echec(`The project settings on \`${base}\` could not be read: ${message(erreur)}`);
  }

  const dits = changementsDits(avant, apres);
  const titre = `Project settings: ${dits.join("; ")}`;
  const git = (args: string[]) => execFileSync("git", args, { cwd: worktree, env, timeout: DELAI_MS, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    // Le fichier des réglages, et lui seul : rien d'autre du worktree n'entre au commit.
    git(["add", "--", FICHIER]);
    git([...IDENTITE, "commit", "--quiet", "--no-verify", "-m", `${titre}\n\nProposed from the project's settings (${run}).`, "--", FICHIER]);
  } catch (erreur) {
    depot.retirer(worktree, branche);
    return echec(`The change of \`${FICHIER}\` could not be committed: ${sortieDeGit(erreur)}`);
  }
  try {
    depot.pousser(branche);
  } catch (erreur) {
    depot.retirer(worktree, branche);
    return echec(`The branch \`${branche}\` could not be pushed: ${message(erreur)}`);
  }

  const corps = [
    `This pull request changes the project's settings, in \`${FICHIER}\` and nothing else:`,
    "",
    ...dits.map((dit) => `- ${dit}`),
    "",
    "It is held for the chef: the pass judges it, but never merges a change of the project's settings itself. Once merged, every station applies it the next time it reads the settings, with no restart.",
  ].join("\n");
  let proposition: Proposition;
  try {
    const pr = await github.ouvrirPR({ branche, base, titre, corps });
    const ouverte = await github.prDeBranche(branche);
    if (ouverte === null) throw new Error(`GitHub does not return the pull request it just opened (${pr})`);
    proposition = { ok: true, pr, numero: ouverte.number, branche, reglages: apres };
  } catch (erreur) {
    proposition = echec(`The pull request could not be opened: ${message(erreur)}. The branch \`${branche}\` is pushed, with the change.`);
  }
  // La branche reste, poussée : c'est elle que la pass juge.
  await depot.ranger(worktree, branche).catch((erreur) => avertir(`brigade : worktree du réglage ${run} non rangé — ${message(erreur)}`));
  // Ouverte, elle entre en pass du même geste : une PR des réglages que
  // personne ne jugerait n'aurait rien qui la retienne pour le chef.
  if (proposition.ok) options.remettre({ run, branche, pr: proposition.pr, numero: proposition.numero });
  return proposition;
}
