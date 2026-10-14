// L'étape « stations » de l'installation, faite par l'app pour le chef — ou par
// lui. Jouée par `installation` (`installation-cli.ts`) :
//   npm --prefix runtime run installation -- stations                  ce que cette machine fournit, ce que le projet déclare, et où en est l'étape
//   npm --prefix runtime run installation -- stations --json           la même lecture, pour un programme : un objet JSON, sur une ligne
//   npm --prefix runtime run installation -- stations <déclaration>    déclare les stations choisies, et note l'étape faite
//
// Le chef voit les stations que la machine fournit, en choisit, dit combien
// de cooks chacune fait tourner à la fois, et valide : la déclaration est une
// décision du chef (`decisions.ts`), posée au journal du projet sous le compte
// du service — celui que le geste de box `brigade` donne à toute commande.
// Elle n'écrit ni drop-in ni rien de root : aucun `sudo`, aucun geste de box
// de plus, rien qui puisse manquer sur la box ou y être trop vieux. Le runtime
// qui tourne la lit à son réveil suivant, sans redémarrage ; celui qui n'a pas
// encore démarré, à son démarrage.
//
// Une déclaration que le runtime ne lirait pas est refusée, et rien n'est
// écrit : ni la décision, ni l'étape. Le plafond de cooks n'est jamais
// proposé : une décision du chef n'a pas de défaut.
import { existsSync } from "node:fs";
import { Sortie, type Appel } from "./appel.ts";
import { decisionsPosees, poserDecision } from "./decisions.ts";
import { ETAPES, installationDe, noterEtape } from "./etapes.ts";
import { geste } from "./geste.ts";
import { trouver } from "./installation.ts";
import { cheminJournal, ouvrirJournal, type Journal } from "./journal.ts";
import { ConfigInvalide } from "./runtime.ts";
import { direStations, FORME, lireStations, VARIABLE_DES_STATIONS, type StationDeclaree } from "./stations-declarees.ts";

const ETAPE = "stations";
const AUTEUR = "chef";
const USAGE = [
  "usage : <environnement du service> npm --prefix runtime run installation -- stations [--json]",
  `        <environnement du service> npm --prefix runtime run installation -- stations <déclaration : ${FORME}, séparées par des virgules>`,
].join("\n");

// La machine du runtime, telle que les noms de ses stations la désignent.
export const MACHINE = "box";
// Ce qu'une station de cette machine fournit d'office : le moteur `claude`
// code et raisonne. Le chef en retire ou en ajoute avant de valider.
export const FOURNIT_PAR_LE_MOTEUR = ["code", "raisonnement"];

// Une station que la machine fournit : son nom et ce qu'elle fournit. Son
// plafond de cooks reste au chef.
export type StationProposee = { nom: string; moteur: string; fournit: string[]; cooks: null; ou: string };

// Les stations que cette machine fournit : une par moteur que le runtime sait
// y lancer — `claude`, trouvé dans le `PATH` que le service donne à cette
// commande. Sans lui, aucune : `absent` dit pourquoi.
export function stationsProposees(env: Record<string, string | undefined>): { proposees: StationProposee[]; absent: string | null } {
  const bin = env.BRIGADE_CLAUDE_BIN || "claude";
  const ou = trouver(bin, env.PATH ?? "");
  if (ou === null) {
    return {
      proposees: [],
      absent: `\`${bin}\` est introuvable dans le \`PATH\` du service : cette machine ne fournit aucune station où lancer un cook — \`${geste("installation", env)}\` dit le geste qui le pose`,
    };
  }
  return { proposees: [{ nom: `${MACHINE}/claude`, moteur: "claude", fournit: [...FOURNIT_PAR_LE_MOTEUR], cooks: null, ou }], absent: null };
}

// Les stations que le journal du répertoire d'état déclare, en lecture seule.
// Aucun journal, ou une déclaration que le runtime ne lirait pas : aucune.
export function stationsDeclareesAuJournal(repertoireEtat: string): StationDeclaree[] {
  if (!existsSync(cheminJournal(repertoireEtat))) return [];
  const journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  try {
    return lireStations({ [VARIABLE_DES_STATIONS]: decisionsPosees(journal.base)[VARIABLE_DES_STATIONS] });
  } catch {
    return [];
  } finally {
    journal.fermer();
  }
}

// Déclare les stations et note l'étape faite, ensemble : l'une ne s'écrit pas
// sans l'autre. Rend vrai si la déclaration a changé. Une déclaration que le
// runtime ne lirait pas lève `ConfigInvalide`, et rien n'est écrit.
export function declarerStations(journal: Journal, pose: { projet: string; declaration: string; auteur: string }): boolean {
  return journal.base.transaction(() => {
    const posee = poserDecision(journal, { projet: pose.projet, nom: VARIABLE_DES_STATIONS, valeur: pose.declaration, auteur: pose.auteur });
    noterEtape(journal, { projet: pose.projet, etape: ETAPE, etat: "done", auteur: pose.auteur });
    return posee !== null;
  });
}

const ETATS_LUS = { todo: "à faire", done: "faite", waiting: "en attente" } as const;

// La forme JSON : un contrat avec l'app, figé par `test/declarer-stations.test.ts`.
export function faitsDesStations(lus: { etat: keyof typeof ETATS_LUS; proposees: StationProposee[]; absent: string | null; declarees: StationDeclaree[] }) {
  return {
    etape: { id: ETAPE, etat: ETATS_LUS[lus.etat] },
    proposees: lus.proposees.map(({ nom, moteur, fournit, cooks }) => ({ nom, moteur, fournit, cooks })),
    absent: lus.absent,
    declarees: lus.declarees.map(({ nom, moteur, fournit, cooks, distante }) => ({ nom, moteur, fournit, cooks, distante: distante === true })),
  };
}

export function principal({ args, env, dire, redire }: Appel): void {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
  const etape = ETAPES.find((connue) => connue.id === ETAPE);
  if (etape === undefined) throw new Error(`l'étape « ${ETAPE} » n'est plus une étape de l'installation`);

  if (args.length === 0 || (args.length === 1 && args[0] === "--json")) {
    const etat = installationDe(repertoireEtat).etapes.find((lue) => lue.id === ETAPE)?.etat ?? "todo";
    const faits = faitsDesStations({ etat, ...stationsProposees(env), declarees: stationsDeclareesAuJournal(repertoireEtat) });
    if (args.length === 1) dire(JSON.stringify(faits));
    else montrer(faits);
    return;
  }

  const [declaration = ""] = args;
  if (args.length !== 1 || declaration.startsWith("-")) echouer(2, USAGE);
  if (declaration.trim() === "") echouer(2, `une déclaration vide ne déclare aucune station : aucun cook ne partirait — rien n'est écrit\n${USAGE}`);
  // Refusée avant d'ouvrir quoi que ce soit : rien n'est écrit, pas même un
  // journal neuf.
  try {
    lireStations({ [VARIABLE_DES_STATIONS]: declaration });
  } catch (erreur) {
    if (erreur instanceof ConfigInvalide) echouer(2, `${erreur.message} — rien n'est écrit`);
    throw erreur;
  }
  // Sans journal, il en naît un au nom que l'unité donne au projet, comme
  // pour une décision posée par `station`.
  if (!existsSync(cheminJournal(repertoireEtat)) && !env.BRIGADE_PROJECT) echouer(1, `aucun journal dans ${repertoireEtat}, et BRIGADE_PROJECT n'est pas défini : rien ne dit à quel projet déclarer les stations`);
  const journal = ouvrirJournal(repertoireEtat);
  try {
    const projet = journal.base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project ?? env.BRIGADE_PROJECT ?? "";
    const change = declarerStations(journal, { projet, declaration, auteur: AUTEUR });
    const stations = direStations(lireStations({ [VARIABLE_DES_STATIONS]: declaration }));
    dire(
      change
        ? `brigade : stations déclarées — ${stations} ; lues par le runtime à son réveil suivant, sans redémarrage, ou à son démarrage`
        : `brigade : ces stations sont déjà déclarées — ${stations} ; rien n'est réécrit`,
    );
    dire(`brigade : « ${etape.titre} » notée faite`);
  } finally {
    journal.fermer();
  }

  function montrer(faits: ReturnType<typeof faitsDesStations>): void {
    if (etape === undefined) return;
    dire(`brigade : « ${etape.titre} » — ${faits.etape.etat}`);
    dire(`  à quoi elle sert : ${etape.sert}`);
    dire(`  si tu la sautes  : ${etape.sauter}`);
    dire("");
    dire("Ce que cette machine fournit");
    if (faits.absent !== null) dire(`  aucune station — ${faits.absent}`);
    for (const proposee of faits.proposees) dire(`  ${proposee.nom.padEnd(16)}fournit : ${proposee.fournit.join(", ")} — plafond de cooks à choisir`);
    dire("");
    dire("Ce que le projet déclare");
    if (faits.declarees.length === 0) dire("  aucune station — aucun cook ne part, les tickets restent en attente");
    for (const declaree of faits.declarees) {
      dire(`  ${declaree.nom.padEnd(16)}fournit : ${declaree.fournit.join(", ")} — ${declaree.cooks} cook${declaree.cooks > 1 ? "s" : ""} au plus${declaree.distante ? " — distante : elle tire son travail" : ""}`);
    }
    const exemple = faits.proposees[0];
    dire("");
    dire(
      `Pour les déclarer : \`${geste(`installation stations ${exemple === undefined ? FORME : `${exemple.nom}:<plafond de cooks>:${exemple.fournit.join("+")}`}`, env)}\` — une station par entrée, séparées par des virgules`,
    );
  }
}
