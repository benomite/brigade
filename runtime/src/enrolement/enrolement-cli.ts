// Les trois temps de l'enrôlement d'un serveur, tels que les lance le geste
// `runtime/deploy/brigade-enrolement` :
//
//   prepare --to <destination ssh> [--name <nom>] [--repo <dépôt>] [--branch <branche>] [--registry <répertoire>]
//       chez le chef : tire un code à usage unique et rend la commande à
//       lancer sur le serveur — {"code", "command", "expiresAt"}.
//   present <code> [--name <nom>] [--capability <capacité>]…
//       sur le serveur : la présentation de la machine, avec son code —
//       {"code", "presentation"}. Rien n'est écrit.
//   receive [--registry <répertoire>]
//       chez le chef, lancé par le serveur via `ssh` : lit {"code",
//       "presentation"} sur l'entrée standard, valide le code et présente la
//       machine au registre, « en attente » — {"ok": true, "station"}, ou
//       {"ok": false, "reason", "said"} sans rien écrire.
//
// Le registre est celui du chef : `--registry`, sinon BRIGADE_REGISTRE_DIR,
// sinon `$XDG_STATE_HOME/brigade` (`~/.local/state/brigade`).
//
// Fait pour un programme : la réponse est un objet JSON, sur une ligne de la
// sortie standard ; ce qui s'adresse à un humain va sur la sortie d'erreur —
// que `ssh` rend au terminal du serveur. Codes de sortie : 0, servi ; 1,
// refusé ; 2, mal écrit.
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { PresentationInvalide, type Presentation } from "../stations-globales/registre.ts";
import { CodeRefuse, DemandeInvalide, ouvrirEnrolements, repertoireDuRegistre, type OptionsEnrolements } from "./enrolement.ts";
import { machineCourante, presenterLaMachine, type Machine } from "./presentation.ts";

const USAGE = [
  "usage : brigade-enrolement prepare --to <destination ssh> [--name <nom>] [--repo <dépôt>] [--branch <branche>] [--registry <répertoire>]",
  "        brigade-enrolement present <code> [--name <nom>] [--capability <capacité>]…",
  "        brigade-enrolement receive [--registry <répertoire>]   (la présentation sur l'entrée standard)",
].join("\n");

export const SERVED = 0;
export const REFUSE = 1;
export const MAL_ECRIT = 2;

const OPTIONS: Record<string, string[]> = {
  prepare: ["--to", "--name", "--repo", "--branch", "--registry"],
  present: ["--name", "--capability"],
  receive: ["--registry"],
};
const REPETABLES = ["--capability"];

export type OptionsDuGeste = OptionsEnrolements & { machine?: () => Machine };

export async function principal({ args, env, dire, redire }: Appel, entree: () => Promise<string> = async () => "", options: OptionsDuGeste = {}): Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade-enrolement : ${message}`);
    throw new Sortie(code);
  }
  const [geste, ...suite] = args;
  const permises = geste === undefined ? undefined : OPTIONS[geste];
  if (!permises) echouer(MAL_ECRIT, USAGE);

  const lues = new Map<string, string[]>();
  const nus: string[] = [];
  for (let i = 0; i < suite.length; i++) {
    const mot = suite[i] ?? "";
    if (!mot.startsWith("--")) nus.push(mot);
    else if (!permises.includes(mot) || (lues.has(mot) && !REPETABLES.includes(mot)) || i + 1 >= suite.length) echouer(MAL_ECRIT, USAGE);
    else lues.set(mot, [...(lues.get(mot) ?? []), suite[++i] ?? ""]);
  }
  const option = (nom: string) => lues.get(nom)?.[0];
  const registre = () => {
    try {
      return option("--registry") ?? repertoireDuRegistre(env);
    } catch (erreur) {
      if (erreur instanceof DemandeInvalide) echouer(MAL_ECRIT, erreur.message);
      throw erreur;
    }
  };

  if (geste === "present") {
    const [code] = nus;
    if (!code || nus.length > 1) echouer(MAL_ECRIT, USAGE);
    const machine = (options.machine ?? (() => machineCourante()))();
    dire(JSON.stringify({ code, presentation: presenterLaMachine(machine, { nom: option("--name"), capacites: lues.get("--capability") ?? [] }) }));
    return;
  }
  if (nus.length > 0) echouer(MAL_ECRIT, USAGE);

  if (geste === "prepare") {
    const vers = option("--to");
    if (vers === undefined) echouer(MAL_ECRIT, USAGE);
    const enrolements = ouvrirEnrolements(registre(), options);
    try {
      const { code, commande, expireLe } = enrolements.preparer({ vers, nom: option("--name"), depot: option("--repo"), branche: option("--branch") });
      dire(JSON.stringify({ code, command: commande, expiresAt: expireLe }));
      redire(`brigade-enrolement : lance cette commande sur le serveur, avant ${expireLe} — elle n'enrôle qu'une machine, une fois`);
    } catch (erreur) {
      if (erreur instanceof DemandeInvalide) echouer(MAL_ECRIT, erreur.message);
      throw erreur;
    } finally {
      enrolements.fermer();
    }
    return;
  }

  // receive
  let demande: { code?: unknown; presentation?: unknown };
  try {
    demande = JSON.parse(await entree()) as typeof demande;
  } catch {
    echouer(MAL_ECRIT, "l'entrée standard n'est pas une présentation : {\"code\", \"presentation\"} sur une ligne est attendu");
  }
  if (typeof demande?.code !== "string" || typeof demande.presentation !== "object" || demande.presentation === null) {
    echouer(MAL_ECRIT, "l'entrée standard n'est pas une présentation : {\"code\", \"presentation\"} sur une ligne est attendu");
  }
  const enrolements = ouvrirEnrolements(registre(), options);
  try {
    const station = enrolements.recevoir(demande.code, demande.presentation as Presentation);
    dire(JSON.stringify({ ok: true, station }));
    redire(
      `brigade-enrolement : \`${station.nom}\` (${station.machine}) s'est présentée sous le code ${demande.code} — elle attend dans ta home que tu l'acceptes ; d'ici là, elle ne cuit rien`,
    );
  } catch (erreur) {
    if (erreur instanceof CodeRefuse || erreur instanceof PresentationInvalide) {
      const reason = erreur instanceof CodeRefuse ? erreur.motif : "invalide";
      dire(JSON.stringify({ ok: false, reason, said: erreur.message }));
      echouer(REFUSE, erreur.message);
    }
    throw erreur;
  } finally {
    enrolements.fermer();
  }
}

async function entreeDuProcess(): Promise<string> {
  if (process.stdin.isTTY) return "";
  let lu = "";
  process.stdin.setEncoding("utf8");
  for await (const morceau of process.stdin) lu += morceau;
  return lu;
}

if (import.meta.main) await enProcess((appel) => principal(appel, entreeDuProcess));
