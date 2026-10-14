// Les étapes de l'installation du projet, vues et notées par le chef — ou par
// l'app, pour lui. Jouée par `installation` (`installation-cli.ts`) :
//   npm --prefix runtime run installation -- etapes                  toutes les étapes, dans leur ordre, et la courante
//   npm --prefix runtime run installation -- etapes --json           la même lecture, pour un programme : un objet JSON, sur une ligne
//   npm --prefix runtime run installation -- etapes <étape> <état>   note l'état d'une étape : faite, en-attente ou a-faire
//   npm --prefix runtime run installation -- etapes demarrage faite  termine l'installation, si « Vérifier » est vert
// La lecture ne crée aucun journal : sans journal, rien n'est noté, tout est à
// faire. Noter en crée un au nom du projet que l'unité donne, comme une
// décision du chef — l'installation précède le premier démarrage.
//
// La dernière étape ne se note pas faite sur parole : la vérification est
// jouée, dans l'environnement du service, et l'installation n'est terminée que
// si elle est verte — chaque étape est alors notée faite. Rouge, rien n'est
// terminé : chaque manque est dit avec l'étape à reprendre, et celles que le
// journal portait faites sont remises à faire.
import { existsSync } from "node:fs";
import { Sortie, type Appel } from "./appel.ts";
import { DERNIERE, ETAPES, estUneEtape, installationDe, noterEtape, terminer, type Installation } from "./etapes.ts";
import type { EtatDEtape } from "./evenements/installation.ts";
import { etapesAReprendre, verifier, type Constat } from "./installation.ts";
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

// « 4. Déclarer les stations » : une étape telle que le chef la retrouve dans la liste.
export const nommerEtape = (id: string): string => {
  const rang = ETAPES.findIndex((etape) => etape.id === id);
  return `${rang + 1}. ${ETAPES[rang]?.titre ?? id}`;
};

export async function principal({ args, env, dire, redire }: Appel): Promise<void> {
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
  // La vérification se joue avant d'ouvrir le journal : elle ne tient rien
  // pendant qu'elle interroge le clone et GitHub.
  if (etape === DERNIERE && etat === "done") return await finir(await verifier(env));
  const journal = ouvrirJournal(repertoireEtat);
  try {
    const titre = ETAPES.find((connue) => connue.id === etape)?.titre;
    const fait = noterEtape(journal, { projet: projetDuJournal(journal) ?? env.BRIGADE_PROJECT ?? "", etape, etat, auteur: AUTEUR });
    dire(fait === null ? `brigade : « ${titre} » est déjà ${ETATS_LUS[etat]} — rien n'est écrit` : `brigade : « ${titre} » notée ${ETATS_LUS[etat]}`);
  } finally {
    journal.fermer();
  }

  async function finir(constats: Constat[]): Promise<void> {
    const aReprendre = etapesAReprendre(constats);
    const journal = ouvrirJournal(repertoireEtat as string);
    let fin;
    try {
      fin = terminer(journal, { projet: projetDuJournal(journal) ?? env.BRIGADE_PROJECT ?? "", aReprendre, auteur: AUTEUR });
    } finally {
      journal.fermer();
    }
    if (fin.terminee) {
      dire(`brigade : installation terminée : « Vérifier » est vert — les ${ETAPES.length} étapes sont faites, la cuisine est prête à servir`);
      return;
    }
    const manques = constats.filter((constat) => constat.etat === "manque");
    dire(`brigade : l'installation n'est pas terminée : « Vérifier » n'est pas vert — ${manques.length} manque${manques.length > 1 ? "s" : ""}, aucun cook ne doit être lancé tant qu'il en reste`);
    for (const id of aReprendre) {
      dire("");
      dire(`  à reprendre : ${nommerEtape(id)} (${id})${fin.remises.includes(id) ? ", remise à faire" : ""}`);
      for (const manque of manques.filter((constat) => constat.etape === id)) {
        dire(`    MANQUE  ${manque.texte}`);
        if (manque.geste !== undefined) dire(`            → ${manque.geste}`);
      }
    }
    throw new Sortie(1);
  }

  function montrer({ etapes, courante }: Installation): void {
    const faites = etapes.filter((lue) => lue.etat === "done").length;
    const rang = etapes.findIndex((lue) => lue.id === courante);
    dire(
      courante === null
        ? `brigade : installation terminée — les ${etapes.length} étapes sont faites`
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
