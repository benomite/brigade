// Les étapes de l'installation du projet, vues et notées par le chef — ou par
// l'app, pour lui. Jouée par `installation` (`installation-cli.ts`) :
//   npm --prefix runtime run installation -- etapes                  toutes les étapes, dans leur ordre, et la courante
//   npm --prefix runtime run installation -- etapes --json           la même lecture, pour un programme : un objet JSON, sur une ligne
//   npm --prefix runtime run installation -- etapes <étape> <état>   note l'état d'une étape : faite, en-attente ou a-faire
// La lecture ne crée aucun journal : sans journal, rien n'est noté, tout est à
// faire. Noter en crée un au nom du projet que l'unité donne, comme une
// décision du chef — l'installation précède le premier démarrage.
import { existsSync } from "node:fs";
import { Sortie, type Appel } from "./appel.ts";
import { ETAPES, estUneEtape, installationDe, noterEtape, type Installation } from "./etapes.ts";
import type { EtatDEtape } from "./evenements/installation.ts";
import { cheminJournal, ouvrirJournal, type Journal } from "./journal.ts";

const USAGE = [
  "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run installation -- etapes [--json]",
  "        BRIGADE_STATE_DIR=<répertoire d'état> BRIGADE_PROJECT=<projet> npm --prefix runtime run installation -- etapes <étape> <faite|en-attente|a-faire>",
].join("\n");
const AUTEUR = "chef";

// Ce que le chef tape, et ce que le journal porte.
const ETATS_TAPES: Record<string, EtatDEtape> = { faite: "done", "en-attente": "waiting", "a-faire": "todo" };
// Ce qu'un humain et un programme lisent.
const ETATS_LUS: Record<EtatDEtape, string> = { todo: "à faire", done: "faite", waiting: "en attente" };

// La forme JSON : un contrat avec l'app, figé par `test/etapes.test.ts`.
export function faitsDesEtapes(installation: Installation) {
  return {
    courante: installation.courante,
    etapes: installation.etapes.map(({ id, titre, sert, sauter, geste, etat }) => ({ id, titre, etat: ETATS_LUS[etat], sert, sauter, geste })),
  };
}

export function principal({ args, env, dire, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);

  if (args.length === 0 || (args.length === 1 && args[0] === "--json")) {
    const installation = installationDe(repertoireEtat);
    if (args.length === 1) dire(JSON.stringify(faitsDesEtapes(installation)));
    else montrer(installation);
    return;
  }

  const [etape = "", tape = ""] = args;
  const etat = ETATS_TAPES[tape];
  if (args.length !== 2 || etat === undefined) echouer(2, USAGE);
  if (!estUneEtape(etape)) echouer(2, `« ${etape} » n'est pas une étape de l'installation — attendu ${ETAPES.map((connue) => connue.id).join(", ")}`);
  // Sans journal, il en naît un au nom que l'unité donne au projet.
  if (!existsSync(cheminJournal(repertoireEtat)) && !env.BRIGADE_PROJECT) echouer(1, `aucun journal dans ${repertoireEtat}, et BRIGADE_PROJECT n'est pas défini : rien ne dit à quel projet noter l'étape`);
  const journal = ouvrirJournal(repertoireEtat);
  try {
    const titre = ETAPES.find((connue) => connue.id === etape)?.titre;
    const fait = noterEtape(journal, { projet: projetDuJournal(journal) ?? env.BRIGADE_PROJECT ?? "", etape, etat, auteur: AUTEUR });
    dire(fait === null ? `brigade : « ${titre} » est déjà ${ETATS_LUS[etat]} — rien n'est écrit` : `brigade : « ${titre} » notée ${ETATS_LUS[etat]}`);
  } finally {
    journal.fermer();
  }

  function montrer({ etapes, courante }: Installation): void {
    const faites = etapes.filter((lue) => lue.etat === "done").length;
    const rang = etapes.findIndex((lue) => lue.id === courante);
    dire(
      courante === null
        ? `brigade : les ${etapes.length} étapes de l'installation sont faites`
        : `brigade : ${faites} étape${faites > 1 ? "s" : ""} faite${faites > 1 ? "s" : ""} sur ${etapes.length} — la courante : ${rang + 1}. ${etapes[rang]?.titre}`,
    );
    for (const [numero, lue] of etapes.entries()) {
      dire("");
      dire(`${String(numero + 1).padStart(2)}. ${ETATS_LUS[lue.etat].padEnd(11)}${lue.id === courante ? "→ " : "  "}${lue.titre} (${lue.id})`);
      dire(`    à quoi elle sert : ${lue.sert}`);
      dire(`    si tu la sautes  : ${lue.sauter}`);
      if (lue.geste !== null) dire(`    à faire toi-même : ${lue.geste}`);
    }
  }
}

function projetDuJournal(journal: Journal): string | undefined {
  return journal.base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project;
}
