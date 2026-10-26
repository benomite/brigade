// Le critère de l'épique 1736 : chaque geste que la vue du rail offre encore se fait la box injoignable. Changer la
// priorité, renvoyer en cuisine (la fiche d'un ticket revenu de WAITING, la carte de WAITING), répondre à une correction
// et à un profil proposés, merger, retirer du rail, choisir et répondre sur une carte de TODO : chacun est joué ici par
// le module que le process principal appelle pour lui (main.ts), la box injoignable — un `ssh` qui note chaque appel et
// échoue comme une box qui ne répond pas (`BRIGADE_SSH_BIN`, celui que l'app lance) —, et GitHub en doublure. Chacun
// aboutit, et aucun `ssh` n'est lancé.
import assert from "node:assert/strict";
import { chmodSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { reponseLue, type CarteLue } from "../../src/carte-todo.ts";
import { ACTIONS } from "../../src/gestes-fiche.ts";
import { changerLaPriorite, type ClientDeLaPriorite } from "../../src/priorite.ts";
import { lireLeTableauDuDepot } from "../../src/tableau/lecture.ts";
import { clientDesGestesGitHub, type Poste } from "../../src/tableau-gestes/github.ts";
import { arriveeDeCarte, GESTES_DE_FICHE, gesteDeFiche, reponseALaFile, reponseDeCarte } from "../../src/tableau-gestes/rail.ts";
import { repertoireTemporaire } from "../../../runtime/test/outils.ts";
import { DEPOT, githubDuTableau, NUMERO, projetPublie } from "../tableau/projet-publie.ts";

const SANS_POSIX = process.platform === "win32" ? "le faux ssh est un script shell" : false;

test("la box injoignable, chaque geste que la vue du rail offre encore aboutit — par GitHub seul, sans un `ssh`", { skip: SANS_POSIX }, async (t) => {
  // La box injoignable : le `ssh` que l'app lancerait note son appel et échoue comme ssh sur une box qui ne répond pas.
  const dossier = repertoireTemporaire(t);
  const appels = join(dossier, "appels-ssh");
  const ssh = join(dossier, "ssh");
  writeFileSync(ssh, `#!/bin/sh\necho "$@" >> '${appels}'\necho "ssh: connect to host box port 22: Connection timed out" >&2\nexit 255\n`);
  chmodSync(ssh, 0o755);
  const avant = process.env.BRIGADE_SSH_BIN;
  process.env.BRIGADE_SSH_BIN = ssh;
  t.after(() => (avant === undefined ? delete process.env.BRIGADE_SSH_BIN : (process.env.BRIGADE_SSH_BIN = avant)));

  // Le tableau de la cuisine, lu sur GitHub — ce que la box y a publié avant de devenir injoignable.
  const publie = projetPublie(t, { propositions: true });
  const lu = await lireLeTableauDuDepot({ depot: DEPOT, appeler: githubDuTableau(publie.corps).appeler });
  assert.ok(lu.lu && publie.proposees !== null);
  const { correction, profil } = publie.proposees;

  // GitHub, doublé : chaque commentaire posté sur le tableau, chaque label écrit.
  const postes: string[] = [];
  const poster: Poste = async (_adresse, _entetes, corps) => {
    postes.push((corps as { body: string }).body);
    return { status: 201, data: { id: 9000 + postes.length, html_url: `https://github.com/${DEPOT}/issues/${NUMERO}#issuecomment-${9000 + postes.length}` } };
  };
  const client = clientDesGestesGitHub({ jeton: async () => "gho_du_poste", poster, appeler: async () => ({ status: 404, data: {} }) });
  const labels: string[] = [];
  const clientDesLabels: ClientDeLaPriorite = {
    lire: async () => ({ status: 200, data: { labels: [{ name: "fire" }, { name: "prio:2" }] } }),
    ecrire: async (methode, chemin) => {
      labels.push(`${methode} ${chemin}`);
      return { status: 200, data: [] };
    },
  };
  const carte = (lu.faits?.attend as { ticket: number; carte?: CarteLue }[] | undefined)?.find((a) => a.ticket === 24)?.carte;
  assert.ok(carte !== undefined);
  const lue = (reponse: { choix: number } | { texte: string }) => {
    const une = reponseLue(carte, 24, { question: carte.question, ...reponse });
    assert.ok(!("refus" in une));
    return une;
  };

  // Chaque geste, et ce que le process principal en rend à la vue : fait, ou posté.
  const gestes: Record<string, () => Promise<object>> = {
    "change the priority": () => changerLaPriorite({ depot: DEPOT, ticket: 22, valeur: "1", client: clientDesLabels }),
    "back to the kitchen (sheet)": () => gesteDeFiche(lu, "cuisine", 30, client),
    "it arrived, back to the kitchen (WAITING card)": () => arriveeDeCarte(lu, 30, client),
    "correction: yes": () => reponseALaFile(lu, "correction", correction, "yes", client),
    "profile: no": () => reponseALaFile(lu, "profile", profil, "no", client),
    "merge the PR": () => gesteDeFiche(lu, "merger", 18, client),
    "remove from the rail": () => gesteDeFiche(lu, "retirer", 30, client),
    "choose (TODO card)": () => reponseDeCarte(lu, lue({ choix: 2 }), client),
    "answer (TODO card)": () => reponseDeCarte(lu, lue({ texte: "One for all." }), client),
  };
  for (const [nom, jouer] of Object.entries(gestes)) {
    const rendu = await jouer();
    assert.ok("fait" in rendu || "postee" in rendu || "repondue" in rendu, `${nom}: ${JSON.stringify(rendu)}`);
  }

  assert.deepEqual(postes, [
    "/brigade arrived #30",
    "/brigade arrived #30",
    `/brigade correction yes ${correction}`,
    `/brigade profile no ${profil}`,
    "/brigade merge #18",
    "/brigade set-aside #30",
    "/brigade choose #24 2",
    "/brigade answer #24 One for all.",
  ]);
  assert.deepEqual(labels, [`POST /repos/${DEPOT}/issues/22/labels`, `DELETE /repos/${DEPOT}/issues/22/labels/prio%3A2`]);
  assert.equal(existsSync(appels), false, "aucun ssh n'est lancé");

  // Et aucun geste de la fiche ne retombe sur la box : ceux qui avaient une commande de box sont tous sur le tableau.
  const versLaBox = Object.entries(ACTIONS).flatMap(([id, branchement]) => ("box" in branchement ? [id] : []));
  for (const id of versLaBox) assert.ok(Object.hasOwn(GESTES_DE_FICHE, id), `${id} part sur le tableau`);
});
