// L'étage commun des leçons, vu et tranché par le chef, depuis son propre process :
//   node runtime/src/commun/commun-cli.ts                       les leçons proposées, avec leurs projets, et celles de l'étage
//   node runtime/src/commun/commun-cli.ts yes <proposition>     « oui » : la leçon entre à l'étage, les cooks de tous les projets la reçoivent
//   node runtime/src/commun/commun-cli.ts no <proposition>      « non » : elle reste propre à chaque projet, et n'est plus proposée
//   node runtime/src/commun/commun-cli.ts retire <id>           retire une leçon de l'étage (C1…) : plus aucun cook ne la reçoit, elle n'est plus proposée
// avec l'environnement de la station (`BRIGADE_STATION_DIR`, et le seuil
// `BRIGADE_COMMON_TIER_PROJECTS`). `<proposition>` est la clé que la liste
// donne. Codes : 0, la réponse est écrite — ou la proposition l'était déjà ;
// 1, rien n'est écrit, la raison sur la dernière ligne ; 2, l'appel ne se lit pas.
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { ConfigInvalide } from "../runtime.ts";
import { ecrireEtage, LeconCommuneInconnue, lireEtage, lireSeuilCommun, propositions, retirer, trancher, VARIABLE_SEUIL_COMMUN, type Provenance } from "./etage.ts";
import { carnetsDeLInstallation } from "./installation.ts";

const OUI = "yes";
const NON = "no";
const RETIRER = "retire";

const USAGE = [
  "usage: BRIGADE_STATION_DIR=<station directory> node runtime/src/commun/commun-cli.ts [<answer> <proposal>]",
  "  yes <proposal>   the lesson joins the common tier: the cooks of every project receive it",
  "  no <proposal>    the lesson stays in each project's own lesson notebook, and is not proposed again",
  "  retire <id>      a lesson of the common tier (C1…) is retired for good: no cook of any project receives it, and it is not proposed again",
].join("\n");

const projetsDe = (projets: Provenance[]) => projets.map((p) => `${p.projet} (${p.id})`).join(", ");

export function principal({ args, env, dire, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade: ${message}`);
    throw new Sortie(code);
  }

  const racine = env.BRIGADE_STATION_DIR;
  if (!racine) echouer(2, `BRIGADE_STATION_DIR is not set\n${USAGE}`);
  const [reponse, cle, ...reste] = args;
  if (reponse === RETIRER) {
    if (cle === undefined || !/^C[1-9]\d*$/.test(cle) || reste.length > 0) echouer(2, `the id of a lesson of the common tier is needed (C1…)\n${USAGE}`);
  } else if (reponse !== undefined && reponse !== OUI && reponse !== NON) echouer(2, `unknown answer: “${reponse}”\n${USAGE}`);
  if (reponse !== undefined && reponse !== RETIRER && (cle === undefined || !/^[0-9a-f]{8}$/.test(cle) || reste.length > 0)) echouer(2, `the proposal's key is needed\n${USAGE}`);

  let seuil: number;
  try {
    seuil = lireSeuilCommun(env);
  } catch (erreur) {
    if (!(erreur instanceof ConfigInvalide)) throw erreur;
    echouer(1, erreur.message);
  }
  let etage;
  try {
    etage = lireEtage(racine);
  } catch (erreur) {
    echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
  }
  const { carnets, illisibles } = carnetsDeLInstallation(racine, env);
  const total = carnets.length + illisibles.length;

  if (reponse === undefined) {
    if (total < 2) {
      dire(`no common tier: this installation serves ${total === 0 ? "no project" : "a single project"}`);
      return;
    }
    dire(`common tier — ${total} projects; a lesson promoted in ${seuil} of them is proposed (${VARIABLE_SEUIL_COMMUN})`);
    for (const { projet, raison } of illisibles) dire(`${projet}: lesson notebook unreadable, it counts for no proposal — ${raison}`);
    const proposees = propositions(carnets, seuil, etage);
    if (proposees.length === 0) dire("no lesson is proposed");
    for (const proposition of proposees) {
      dire(`${proposition.cle}  ${proposition.texte}`);
      dire(`          promoted in ${projetsDe(proposition.projets)}`);
    }
    for (const lecon of etage.lecons) {
      if (lecon.etat === "accepted") dire(`${lecon.id}  ${lecon.texte}  (accepted ${lecon.date}, from ${lecon.projets.map((p) => p.projet).join(", ")})`);
      else if (lecon.sortie !== undefined) dire(`${lecon.id}  ${lecon.texte}  (${lecon.etat} ${lecon.sortie.date})`);
    }
    return;
  }

  if (reponse === RETIRER) {
    try {
      const { etage: retiree, lecon, deja } = retirer(etage, cle!, new Date().toISOString().slice(0, 10));
      if (deja) dire(`already out — ${cle} is ${lecon.etat}, no cook receives it`);
      else {
        ecrireEtage(racine, retiree);
        dire(`${cle} retired: no cook of any project receives it, and it is not proposed again`);
      }
    } catch (erreur) {
      if (!(erreur instanceof LeconCommuneInconnue)) throw erreur;
      echouer(1, erreur.message);
    }
    return;
  }

  const deja = etage.lecons.find((lecon) => lecon.cle === cle);
  const dit = (lecon: { etat: "accepted" | "refused" | "retired" | "expired"; id?: string; projets: Provenance[] }) =>
    lecon.etat === "retired" || lecon.etat === "expired"
      ? `“yes” to ${cle}: lesson ${lecon.id} joined the common tier, then ${lecon.etat === "retired" ? "was retired" : "expired"} — no cook receives it, and it is not proposed again`
      : lecon.etat === "accepted"
      ? `“yes” to ${cle}: lesson ${lecon.id} joins the common tier — the cooks of every project receive it`
      : `“no” to ${cle}: the lesson stays in ${lecon.projets.map((p) => p.projet).join(", ")} only, and is not proposed again`;
  if (deja !== undefined) {
    dire(`already answered — ${dit(deja)}`);
    return;
  }
  if (total < 2) echouer(1, `no common tier: this installation serves ${total === 0 ? "no project" : "a single project"}`);
  const proposition = propositions(carnets, seuil, etage).find((p) => p.cle === cle);
  if (proposition === undefined) echouer(1, `no lesson is proposed under ${cle}`);
  const { etage: tranche, tranchee } = trancher(etage, proposition, reponse === OUI ? "accepted" : "refused", new Date().toISOString().slice(0, 10));
  ecrireEtage(racine, tranche);
  dire(dit(tranchee));
}

if (import.meta.main) await enProcess((appel) => principal(appel));
