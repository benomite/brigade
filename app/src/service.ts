// L'installation d'un projet, guidée : l'écran que l'espace du projet pose en tête de
// son panneau, de « Ajouter le projet » à « installation terminée ».
//
// Les étapes ne sont pas à l'app : elles sont au runtime du projet, sur sa box
// (`installation etapes`, runtime/src/etapes.ts) — une liste fixe, connue avant la
// première, chacune avec sa phrase « à quoi elle sert », sa phrase « si tu la sautes »
// et le geste que l'app ne peut pas faire seule. Leur état est au journal du projet :
// fermer l'app et la rouvrir retrouve les mêmes étapes faites, et la courante. L'app
// les lit, les montre toutes avant la première action, et fait chacune par la commande
// du runtime qui la fait, lancée à la place du chef par le geste de la box — comme la
// veille lance `status` :
//
//   ajout         notée faite dès que la box répond pour le projet : c'est elle qui l'a fait exister
//   init          `/brigade:init` s'ouvre dans le second ; « mergé » est la parole du chef (`etapes init faite`)
//   verification  `installation`, en entier — ce qui manque à la box est annoncé, avec son geste
//   stations      `installation stations` : les stations que la box fournit, déclarées au plafond choisi
//   protection    `installation protection poser`
//   decisions     `installation decisions courante` : une décision à la fois, sa question, ses options
//   demarrage     `etapes demarrage faite` : la box revérifie tout, et ne termine que si c'est vert
//
// Ce que l'app ne peut pas faire à la place du chef est dit d'emblée, avant le premier
// bouton : la session `/brigade:init` et son merge, ce que « Vérifier » dit manquer à
// la box — chaque manque avec sa commande, mot pour mot —, et le démarrage du service,
// un geste `root` qu'aucun geste de la box ne donne sans mot de passe. Celui-là, l'app
// l'écrit dans un shell de l'espace, sans l'envoyer. C'est pour l'annoncer que
// « Vérifier » part de lui-même quand l'écran s'ouvre sur une installation pas finie :
// il ne lance ni cook ni setup, et se rejoue sans dégât.
//
// L'app ne décide d'aucune étape : elle lit ce que le runtime en dit, et lui fait
// noter ce que le chef a fait. Rien n'est gardé ici qui ne se relise sur la box.
//
// L'installation terminée, l'écran ne revient plus (`termine`). Le projet est alors contrôlé :
// ses stations (`installation stations --json`) et ce que la vérification dit manquer, relus
// sans rien noter au journal — une étape remise à faire rouvrirait l'écran. Ce qu'il a perdu
// se dit dans la bande d'alertes, avec son geste (alertes.ts, « Ce qu'un projet installé a perdu »).
import { echecDe, type Echec, type Rendu as RenduDeBox, type Servi } from "./box.ts";
import type { Projet } from "./config.ts";
import { titreDEchec } from "./faits.ts";
import { FORME_ATTENDUE, refusDeForme } from "./nom.ts";
import type { Terminal } from "./terminaux.ts";

// La session qui amorce le dépôt (docs/installer.md, « Amorcer le dépôt »).
export const INIT = "/brigade:init";
// La commande du runtime qui dit si le projet est prêt, et tout ce qui manque d'un coup.
export const VERIFICATION = "installation";
// La même, qui rend son verdict structuré (runtime/src/verdict.ts) : c'est elle que « Vérifier »
// lance. Le contrôle d'un projet installé lit, lui, la sortie texte.
export const JUGEMENT = `${VERIFICATION} --json`;
// Les commandes du runtime que l'écran lance, chacune sous `installation` (runtime/src/installation-cli.ts).
export const COMMANDES = {
  etapes: "installation etapes --json",
  stations: "installation stations --json",
  protection: "installation protection --json",
  decisions: "installation decisions courante --json",
} as const;
const DOC = "docs/installer.md";

// --- Ce que le runtime rend, lu sans rien croire sur parole. Chaque forme est un
// contrat que le runtime fige dans ses tests ; le test de l'app la tire de ses fonctions.

export type EtatDEtape = "todo" | "done" | "waiting";
// Les mots du runtime (`ETATS_LUS`, runtime/src/etapes-cli.ts).
const ETATS: Readonly<Record<string, EtatDEtape>> = { "à faire": "todo", faite: "done", "en attente": "waiting" };

export type EtapeLue = { id: string; titre: string; etat: EtatDEtape; sert: string; sauter: string; geste: string | null };
// `courante` : la première étape qui n'est pas faite — null, l'installation est terminée.
export type EtapesLues = { courante: string | null; etapes: EtapeLue[] };

export type StationProposee = { nom: string; moteur: string; fournit: string[] };
export type StationDeclaree = { nom: string; moteur: string; fournit: string[]; cooks: number; distante: boolean };
// `absent` : pourquoi la box ne fournit aucune station — null, si elle en fournit.
export type StationsLues = { proposees: StationProposee[]; absent: string | null; declarees: StationDeclaree[] };

export type Droit = { droit: string; action: string; pourquoi: string };
export type ProtectionLue = { depot: string; branche: string; protection: "posée" | "autre" | "absente" | "illisible"; manque: string[]; droits: Droit[]; raison: string | null };

export type Option = { valeur: string; effet: string };
// `avec` : la décision qui se répond en même temps qu'elle (le modèle du closer et son effort).
export type DecisionLue = {
  nom: string;
  question: string;
  options: Option[];
  recommandee: { valeur: string; pourquoi: string } | null;
  sauter: string;
  reclamee: boolean;
  avec: { nom: string; question: string; options: Option[] } | null;
};
// `courante` : la seule décision à poser maintenant — null, aucune n'attend. `enAttente` la compte.
export type CouranteLue = { enAttente: number; courante: DecisionLue | null; suivantes: string[] };

type Lu = Record<string, unknown>;
const chaine = (lu: unknown): lu is string => typeof lu === "string";
const chaines = (lu: unknown): lu is string[] => Array.isArray(lu) && lu.every(chaine);

// Le dernier objet JSON de la sortie que `est` reconnaît : une commande du runtime le rend
// sur une ligne, et rien d'autre ne s'en déduit.
function objetDe(sortie: string, est: (lu: Lu) => boolean): Lu | undefined {
  for (const ligne of sortie.split("\n").reverse()) {
    try {
      const lu: unknown = JSON.parse(ligne);
      if (lu !== null && typeof lu === "object" && !Array.isArray(lu) && est(lu as Lu)) return lu as Lu;
    } catch {
      // Pas un objet : une autre ligne de la sortie.
    }
  }
  return undefined;
}

export function lireEtapes(sortie: string): EtapesLues | undefined {
  const lu = objetDe(sortie, (objet) => Array.isArray(objet.etapes) && "courante" in objet);
  if (lu === undefined) return undefined;
  const etapes: EtapeLue[] = [];
  for (const recue of lu.etapes as unknown[]) {
    const { id, titre, etat, sert, sauter, geste } = (recue ?? {}) as Lu;
    const lue = chaine(etat) ? ETATS[etat] : undefined;
    if (!chaine(id) || !chaine(titre) || lue === undefined || !chaine(sert) || !chaine(sauter) || !(geste === null || chaine(geste))) return undefined;
    etapes.push({ id, titre, etat: lue, sert, sauter, geste });
  }
  const { courante } = lu;
  if (!(courante === null || (chaine(courante) && etapes.some(({ id }) => id === courante)))) return undefined;
  return { courante, etapes };
}

export function lireStations(sortie: string): StationsLues | undefined {
  const lu = objetDe(sortie, (objet) => Array.isArray(objet.proposees) && Array.isArray(objet.declarees));
  if (lu === undefined || !(lu.absent === null || chaine(lu.absent))) return undefined;
  const proposees: StationProposee[] = [];
  for (const recue of lu.proposees as unknown[]) {
    const { nom, moteur, fournit } = (recue ?? {}) as Lu;
    if (!chaine(nom) || !chaine(moteur) || !chaines(fournit)) return undefined;
    proposees.push({ nom, moteur, fournit });
  }
  const declarees: StationDeclaree[] = [];
  for (const recue of lu.declarees as unknown[]) {
    const { nom, moteur, fournit, cooks, distante } = (recue ?? {}) as Lu;
    if (!chaine(nom) || !chaine(moteur) || !chaines(fournit) || typeof cooks !== "number") return undefined;
    declarees.push({ nom, moteur, fournit, cooks, distante: distante === true });
  }
  return { proposees, absent: lu.absent, declarees };
}

const PROTECTIONS = ["posée", "autre", "absente", "illisible"] as const;

export function lireProtection(sortie: string): ProtectionLue | undefined {
  const lu = objetDe(sortie, (objet) => chaine(objet.protection) && chaine(objet.branche));
  if (lu === undefined) return undefined;
  const { depot, branche, protection, manque, droits, raison } = lu;
  const connue = PROTECTIONS.find((mot) => mot === protection);
  if (!chaine(depot) || !chaine(branche) || connue === undefined || !chaines(manque) || !Array.isArray(droits) || !(raison === null || chaine(raison))) return undefined;
  const lus: Droit[] = [];
  for (const recu of droits as unknown[]) {
    const { droit, action, pourquoi } = (recu ?? {}) as Lu;
    if (!chaine(droit) || !chaine(action) || !chaine(pourquoi)) return undefined;
    lus.push({ droit, action, pourquoi });
  }
  return { depot, branche, protection: connue, manque, droits: lus, raison };
}

function options(lu: unknown): Option[] | undefined {
  if (!Array.isArray(lu)) return undefined;
  const lues: Option[] = [];
  for (const recue of lu as unknown[]) {
    const { valeur, effet } = (recue ?? {}) as Lu;
    if (!chaine(valeur) || !chaine(effet)) return undefined;
    lues.push({ valeur, effet });
  }
  return lues;
}

export function lireCourante(sortie: string): CouranteLue | undefined {
  const lu = objetDe(sortie, (objet) => typeof objet.enAttente === "number" && "courante" in objet);
  if (lu === undefined || !chaines(lu.suivantes)) return undefined;
  const { enAttente, suivantes } = lu as { enAttente: number; suivantes: string[] };
  if (lu.courante === null) return { enAttente, courante: null, suivantes };
  const { nom, question, options: recues, recommandee, sauter, reclamee, avec } = (lu.courante ?? {}) as Lu;
  const lues = options(recues);
  const conseil = recommandee as Lu | null;
  if (!chaine(nom) || !chaine(question) || lues === undefined || !chaine(sauter) || typeof reclamee !== "boolean") return undefined;
  if (!(conseil === null || (typeof conseil === "object" && chaine(conseil.valeur) && chaine(conseil.pourquoi)))) return undefined;
  let compagne: DecisionLue["avec"] = null;
  if (avec !== null) {
    const { nom: autre, question: demande, options: siennes } = (avec ?? {}) as Lu;
    const lues = options(siennes);
    if (!chaine(autre) || !chaine(demande) || lues === undefined) return undefined;
    compagne = { nom: autre, question: demande, options: lues };
  }
  return {
    enAttente,
    courante: { nom, question, options: lues, recommandee: conseil === null ? null : { valeur: conseil.valeur as string, pourquoi: conseil.pourquoi as string }, sauter, reclamee, avec: compagne },
    suivantes,
  };
}

// Un point que « Vérifier » dit manquer : son texte, la flèche qui dit le geste qui le
// règle, et l'étape à reprendre qu'il nomme — lus dans la sortie d'`installation`, telle
// que runtime/src/installation-cli.ts l'écrit. Rien n'y est reformulé.
export type Manque = { texte: string; geste: string | null; etape: string | null };

export function manquesDe(sortie: string): Manque[] {
  const manques: Manque[] = [];
  let dernier: Manque | undefined;
  for (const ligne of sortie.split("\n")) {
    const manque = /^ {2}MANQUE {4}(.+)$/.exec(ligne);
    if (manque !== null) {
      dernier = { texte: manque[1] ?? "", geste: null, etape: null };
      manques.push(dernier);
      continue;
    }
    const fleche = /^ {12}→ (.+)$/.exec(ligne)?.[1];
    if (fleche !== undefined && dernier !== undefined) {
      const etape = /^étape à reprendre : \d+\. .+ \(([a-z-]+)\)$/.exec(fleche)?.[1];
      if (etape !== undefined) dernier.etape = etape;
      else if (dernier.geste === null) dernier.geste = fleche;
      continue;
    }
    // Une flèche sous une ligne `à savoir` ne retient rien : elle n'est pas lue.
    dernier = undefined;
  }
  return manques;
}

// --- Le verdict de « Vérifier », structuré : ce qu'`installation --json` rend (runtime/src/verdict.ts).

// Les étapes que l'app fait d'un bouton (runtime/src/installation.ts, `ACTIONS_DE_L_APP`).
export const ACTIONS = ["init", "stations", "protection", "decisions"] as const;
export type Action = (typeof ACTIONS)[number];

// Un manque, dit au chef : `texte` en mots simples, et qui le lève. Pour le chef, l'étape que
// l'app fait d'un bouton, ou la commande exacte — ni l'une ni l'autre quand la box ne les dit pas.
// `constat`, `geste`, `etape` : la ligne, la flèche et l'étape que la sortie texte en écrit.
export type ManqueJuge = { texte: string; constat: string; geste: string | null; etape: string | null } & ({ acteur: "chef"; action: Action | null; commande: string | null } | { acteur: "brigade" });
// Une ligne « à savoir » : elle ne retient rien, et ne compte pas parmi les manques.
export type ASavoir = { texte: string; geste: string | null };
// `phrase` : le verdict en une phrase, tel que le runtime le dit. `brut` : la sortie texte de la
// vérification — ou sa ligne d'erreur, plantée —, au caractère près. `panne` : ce qui a arrêté la
// vérification ; `connue`, l'issue qui la suit.
export type Jugement =
  | { verdict: "pret"; phrase: string; aSavoir: ASavoir[]; brut: string }
  | { verdict: "pas-pret"; phrase: string; manques: ManqueJuge[]; aSavoir: ASavoir[]; brut: string }
  | { verdict: "plantee"; phrase: string; panne: { erreur: string; connue: { issue: number; texte: string } | null }; brut: string };

const optionnelle = (lu: unknown): string | null | undefined => (lu === undefined ? null : chaine(lu) ? lu : undefined);

function lireASavoir(lu: unknown): ASavoir[] | undefined {
  if (!Array.isArray(lu)) return undefined;
  const lues: ASavoir[] = [];
  for (const recue of lu as unknown[]) {
    const { texte, geste } = (recue ?? {}) as Lu;
    const fleche = optionnelle(geste);
    if (!chaine(texte) || fleche === undefined) return undefined;
    lues.push({ texte, geste: fleche });
  }
  return lues;
}

function lireManques(lu: unknown): ManqueJuge[] | undefined {
  if (!Array.isArray(lu)) return undefined;
  const lus: ManqueJuge[] = [];
  for (const recu of lu as unknown[]) {
    const { texte, constat, geste, etape, acteur, action, commande } = (recu ?? {}) as Lu;
    const [fleche, nommee, exacte] = [optionnelle(geste), optionnelle(etape), optionnelle(commande)];
    if (!chaine(texte) || !chaine(constat) || fleche === undefined || nommee === undefined || exacte === undefined) return undefined;
    const commun = { texte, constat, geste: fleche, etape: nommee };
    if (acteur === "brigade") lus.push({ ...commun, acteur });
    // Une action qu'elle ne connaît pas, l'app n'en fait pas de bouton : la flèche dit le geste.
    else if (acteur === "chef") lus.push({ ...commun, acteur, action: ACTIONS.find((connue) => connue === action) ?? null, commande: exacte });
    else return undefined;
  }
  return lus;
}

export function lireJugement(sortie: string): Jugement | undefined {
  const lu = objetDe(sortie, (objet) => chaine(objet.verdict) && chaine(objet.phrase) && chaine(objet.brut));
  if (lu === undefined) return undefined;
  const { verdict, phrase, brut } = lu as { verdict: string; phrase: string; brut: string };
  if (verdict === "plantee") {
    const { erreur, connue } = (lu.panne ?? {}) as Lu;
    if (!chaine(erreur)) return undefined;
    if (connue === null) return { verdict, phrase, panne: { erreur, connue: null }, brut };
    const { issue, texte } = (connue ?? {}) as Lu;
    if (typeof issue !== "number" || !Number.isInteger(issue) || !chaine(texte)) return undefined;
    return { verdict, phrase, panne: { erreur, connue: { issue, texte } }, brut };
  }
  const manques = lireManques(lu.manques);
  const aSavoir = lireASavoir(lu.aSavoir);
  if (manques === undefined || aSavoir === undefined) return undefined;
  if (verdict === "pret" && manques.length === 0) return { verdict, phrase, aSavoir, brut };
  if (verdict === "pas-pret" && manques.length > 0) return { verdict, phrase, manques, aSavoir, brut };
  return undefined;
}

// Les manques d'un verdict, comme les étapes et les annonces les lisent : la ligne de la sortie texte.
const manquesDuJugement = (jugement: Jugement): Manque[] => (jugement.verdict === "pas-pret" ? jugement.manques.map(({ constat, geste, etape }) => ({ texte: constat, geste, etape })) : []);

// Le renouvellement de la session Max en échec, tel que la ligne `à savoir` de la vérification le
// dit (runtime/src/installation.ts, `jugerRenouvellement`) : combien de passages de suite ont
// échoué — la ligne ne le compte qu'à partir de deux, un seul échec est donc 1 — et pourquoi.
// Rien quand la ligne dit un passage réussi, un minuteur inactif, ou n'y est pas : ce n'est pas
// un échec du renouvellement.
export type RenouvellementEnEchec = { echecs: number; raison: string };

export function renouvellementDe(sortie: string): RenouvellementEnEchec | undefined {
  for (const ligne of sortie.split("\n")) {
    const lu = /^ {2}à savoir {2}renouvellement : (?:échec|`claude` introuvable)(?:, (\d+) échecs de suite)?(?: \(dernier passage réussi à [^)]*\))? — (.+)$/.exec(ligne);
    if (lu !== null) return { echecs: lu[1] === undefined ? 1 : Number(lu[1]), raison: lu[2] ?? "" };
  }
  return undefined;
}

// Les étapes dont un manque est un geste sur la box elle-même : l'app ne le fait pas.
const SUR_LA_BOX = ["ajout", "verification"];

// --- Vérifier : `installation`, lancée une fois — en texte, pour le contrôle d'un projet
// installé ; structurée (`installation --json`), pour l'écran.

// Ce qu'`installation` a rendu, lancée une fois. `a` : l'instant où elle a fini.
//   `pret`         sortie en 0, avec sa ligne de verdict : rien ne manque
//   `incomplete`   elle a été lancée, et le projet n'est pas prêt (1), ou elle a refusé son environnement (2)
//   `illisible`    un 0 sans sa ligne de verdict : ce n'est pas elle qui a répondu
//   `sans-verdict` elle n'a rien rendu d'elle-même — la box pas jointe, le geste qui refuse, `ssh` arrêté
// `obtenu` : la ligne lancée, ce que la box a écrit, le code de sortie — tel quel. `sortie` :
// ce qu'elle a écrit sur sa sortie standard, seul : c'est là que ses manques se lisent.
export type Verifiee = { a: string } & ({ etat: "pret" | "incomplete" | "illisible"; obtenu: string; sortie: string } | ({ etat: "sans-verdict" } & Echec));

// La ligne par laquelle `installation` dit un projet prêt (runtime/src/installation-cli.ts).
const verdict = (nom: string) => `brigade : projet « ${nom} » : prêt`;

// Ce que prouve ce que la box a rendu d'`installation`. Les codes sont ceux de
// docs/installer.md, « Vérifier que le projet est prêt » : 0, 1 ou 2, la commande a été
// lancée ; tout autre vient du geste, ou de `ssh`.
export function verdictDe(rendu: RenduDeBox, nom: string, delaiMs: number): Verifiee {
  const a = new Date().toISOString();
  const { erreur } = rendu;
  const obtenu = (code: number) => `${rendu.lance}\n${rendu.erreurs}${rendu.sortie}\n→ exit code ${code}`;
  if (erreur === null) {
    // Un compte enfermé dans une commande forcée rend 0, lui aussi, et autre chose que le verdict.
    const dit = rendu.sortie.split("\n").some((ligne) => ligne.startsWith(verdict(nom)));
    return { a, etat: dit ? "pret" : "illisible", obtenu: obtenu(0), sortie: rendu.sortie };
  }
  if (erreur.killed !== true && (erreur.code === 1 || erreur.code === 2)) return { a, etat: "incomplete", obtenu: obtenu(erreur.code), sortie: rendu.sortie };
  return { a, etat: "sans-verdict", ...echecDe({ ...rendu, erreur }, delaiMs) };
}

// Ce qu'`installation --json` a rendu, lancée une fois : c'est ce que « Vérifier » lance.
//   `jugee`        son verdict, lu — prêt, pas prêt, ou vérification plantée
//   `illisible`    elle a répondu de son code (0, 1 ou 2) sans verdict que l'app sache lire, ou avec
//                  un verdict que son code dément : un runtime d'avant lui, une commande forcée
//   `sans-verdict` rien n'est venu d'elle — la box pas jointe, le geste qui refuse, `ssh` arrêté
// `obtenu` : la ligne lancée, ce que la box a écrit sur sa sortie d'erreur, la sortie brute de la
// vérification à la place de son objet, et le code de sortie.
export type Jugee = { a: string } & ({ etat: "jugee"; jugement: Jugement; obtenu: string } | { etat: "illisible"; obtenu: string } | ({ etat: "sans-verdict" } & Echec));

export function jugementDe(rendu: RenduDeBox, delaiMs: number): Jugee {
  const a = new Date().toISOString();
  const { erreur } = rendu;
  const code = erreur === null ? 0 : erreur.killed !== true && (erreur.code === 1 || erreur.code === 2) ? erreur.code : undefined;
  if (erreur !== null && code === undefined) return { a, etat: "sans-verdict", ...echecDe({ ...rendu, erreur }, delaiMs) };
  const jugement = lireJugement(rendu.sortie);
  // Son code est celui du verdict : 0 prêt, 1 sinon (runtime/src/installation-cli.ts, `juger`).
  if (jugement === undefined || code !== (jugement.verdict === "pret" ? 0 : 1)) return { a, etat: "illisible", obtenu: `${rendu.lance}\n${rendu.erreurs}${rendu.sortie}\n→ exit code ${code}` };
  return { a, etat: "jugee", jugement, obtenu: `${rendu.lance}\n${rendu.erreurs}${jugement.brut}\n→ exit code ${code}` };
}

// Un mot tel que le shell du poste — ou celui de la box — le rendra : entier, sans rien en exécuter.
const mot = (texte: string) => (/^[A-Za-z0-9@._:/+,-]+$/.test(texte) ? texte : `'${texte.replaceAll("'", `'\\''`)}'`);

const sansBox = (nom: string) => `“${nom}” does not say where its box is: there is nothing to install there.`;

// Ce que « Démarrer » écrit pour ce projet — ou pourquoi il n'écrit rien. C'est le geste
// de docs/installer.md, « Servir le premier ticket », celui que la box nomme en fin
// d'installation ; `ssh -t` lui donne un terminal, où `sudo` demande son mot de passe.
export function commandeDeDemarrage(projet: Projet): { commande: string } | { refus: string } {
  if (projet.box === undefined) return { refus: sansBox(projet.nom) };
  const { hote } = projet.box;
  // Un retour à la ligne enverrait la commande ; et dans cette forme, un tiret en tête est une option de `ssh`.
  if (/[\x00-\x1f\x7f]/.test(hote)) return { refus: "nothing is written: “hote” has a control character, and a line break would have sent the command — fix it in the projects file" };
  if (hote.startsWith("-")) return { refus: `nothing is written: “hote” starts with a dash (${hote}), and \`ssh\` would read it as an option in the command — fix it in the projects file` };
  // L'unité porte le nom du projet : seul un nom que la box accepte en nomme une — au caractère près.
  const { nom } = projet;
  if (nom === "" || nom !== nom.trim() || refusDeForme(nom) !== undefined) return { refus: `nothing is written: this project's “nom” is not the name of any instance on the box — expected: ${FORME_ATTENDUE}` };
  return { commande: `ssh -t ${mot(hote)} sudo systemctl enable --now brigade@${nom}.service` };
}

// Ce que le contrôle d'un projet installé a lu sur sa box. `a` : l'instant où il a fini.
// `stations` : ce que la machine fournit et ce que le projet déclare ; `manques` : ce que la
// vérification dit manquer — chacun absent quand la box ne l'a jamais rendu sous sa forme.
// `verification` : le verdict tel que l'écran Verify le pose (phrase, manques, « à savoir », sortie
// brute) — la bande d'alertes le reprend, sans le redire autrement.
export type Controle = { a: string; stations?: StationsLues; manques?: Manque[]; renouvellement?: RenouvellementEnEchec; verification?: Montree };

// --- Ce que la vue pose.

// Un manque, tel que l'écran le pose : en mots simples, qui agit, et — si c'est le chef — le
// bouton qui fait le geste, ou la commande exacte, à copier. `dit` : la flèche de la vérification,
// telle quelle, quand la box ne donne ni l'un ni l'autre.
export type LigneDeManque = {
  texte: string;
  acteur: "chef" | "brigade";
  qui: string;
  geste: { action: Action; libelle: string } | { commande: string } | { dit: string } | null;
};

// Ce que la vue pose d'une vérification. Jugée : `titre`, le verdict en une phrase ; dessous, une
// ligne par manque, puis la panne (vérification plantée) et les lignes « à savoir », à part ;
// `detail`, ce que l'app a obtenu — la sortie brute, intacte —, replié. Sans verdict lisible, ce
// que la box a rendu, et ce qui l'explique. Sans verdict du tout, c'est l'échec de la veille,
// que la vue sait déjà rendre.
export type Montree =
  | { etat: "en-cours"; titre: string }
  | { etat: "pret" | "pas-pret" | "plantee"; a: string; titre: string; manques: LigneDeManque[]; panne: string | null; aSavoir: ASavoir[]; detail: string }
  | { etat: "illisible"; a: string; titre: string; suite: string[]; detail: string }
  | { etat: "sans-verdict"; a: string; titre: string; echec: Echec };

// Ce qu'une lecture de la box a donné, quand ce n'est pas ce qui était demandé.
//   `echec`     la commande n'a pas rendu sa réponse — la veille sait dire le cas
//   `illisible` elle a répondu, et ce n'est pas la forme que l'app connaît : un runtime plus ancien, sans elle
export type Rate = { etat: "echec"; a: string; titre: string; echec: Echec } | { etat: "illisible"; a: string; titre: string; obtenu: string; lignes: string[] };

// Ce qui est demandé à la box pour l'étape courante, et ce qu'elle en a rendu.
export type Detail =
  | { etat: "en-cours"; titre: string }
  | Rate
  | { etat: "lu"; id: "stations"; lu: StationsLues }
  | { etat: "lu"; id: "protection"; lu: ProtectionLue }
  | { etat: "lu"; id: "decisions"; lu: CouranteLue; passable: boolean };

// Une étape telle que l'écran la montre. `manques` : ce que la dernière vérification dit
// qu'il faut reprendre ici. `lignes` : ce que l'app dit de son geste, pour l'étape courante.
// `detail` : ce que la box dit de l'étape courante, quand elle a un geste à choisir — ou des
// décisions qui restent, que le démarrage ne réclame pas, tant que l'installation n'est pas finie.
export type EtapeVue = EtapeLue & { rang: number; courante: boolean; manques: Manque[]; lignes: string[]; detail?: Detail };

// Ce que l'app ne fera pas à la place du chef : dit d'emblée. `geste` : la commande, mot pour
// mot, quand il y en a une ; `texte` : ce qui manque, ou pourquoi c'est à lui.
export type Annonce = { titre: string; texte: string; geste: string | null };

// Ce qu'a donné la dernière action de l'écran : ce que la box en a dit, tel quel.
export type Fait = { a: string; titre: string; ok: boolean; obtenu: string };

// L'installation d'un projet, prête à poser : la vue n'y décide rien.
// `deplie` : le chef l'a entamée, ou elle est en cours — elle s'ouvre d'elle-même.
// `annonces` : `en-cours` tant que la vérification d'ouverture n'a pas répondu.
// `action` : l'action en route — aucune autre ne part, et la vue grise ses boutons.
// `demarrage` : ce que « Démarrer » écrira dans un shell, ou pourquoi il n'écrira rien.
export type Guide = {
  projet: string;
  deplie: boolean;
  titre: string;
  lecture: { etat: "en-cours"; titre: string } | { etat: "lue"; a: string } | Rate;
  etapes: EtapeVue[];
  courante: string | null;
  annonces: { etat: "en-cours" | "lues" | "pas-lues"; liste: Annonce[] };
  verification?: Montree;
  action?: string;
  fait?: Fait;
  demarrage: { commande: string } | { refus: string };
  // L'installation n'est plus à montrer : la box l'a dite terminée (et l'app s'en souvient, même
  // si une lecture échoue ensuite), ou rien n'a jamais dit qu'elle ne l'était pas. L'espace du
  // projet est alors le rail, et rien de l'écran d'installation.
  termine: boolean;
  // Installée, ce que son dernier contrôle a lu : la bande d'alertes en tire ce qui est perdu.
  controle?: Controle;
};

// Ce qu'un appel à la box a donné : la commande a répondu de son code (0, 1 ou 2 — les
// siens), ou rien n'est venu d'elle.
type Joue = { a: string; code: number; sortie: string; obtenu: string } | { a: string; echec: Echec };

type Tenu = {
  hote: string;
  suivi: boolean;
  lecture: Guide["lecture"];
  etapes?: EtapesLues;
  detail?: Detail;
  verification?: Jugee;
  // La vérification en route : une seule à la fois, qu'on attend plutôt que de la doubler.
  verifiant?: Promise<void>;
  // La vérification d'ouverture est partie, une fois : on ne la relance pas à chaque regard.
  annoncee: boolean;
  // Ce que la box a dit un jour de l'installation : terminée (aucune étape courante) ou pas.
  // Une lecture qui échoue ensuite n'en défait rien.
  fini?: boolean;
  action?: string;
  fait?: Fait;
  // Le dernier contrôle de l'installation terminée, et celui qui est en route : un seul à la fois.
  controle?: Controle;
  controlant?: Promise<void>;
};

export type Services = ReturnType<typeof tenirServices>;

const OCCUPE = "Another installation action is running: it answers by itself, then this one can go.";

// Le libellé du bouton qui lève un manque du chef depuis l'app. Les stations et les décisions se
// choisissent : le bouton mène à leur étape, où le choix se fait.
function libelleDAction(action: Action, etapes: EtapeVue[]): string {
  if (action === "init") return `Run ${INIT} in the second`;
  if (action === "protection") return "Protect the integration branch";
  const etape = etapes.find(({ id }) => id === action);
  return etape === undefined ? `Go to the ${action} step` : `Go to step ${etape.rang}. ${etape.titre}`;
}

// Un manque du verdict, tel que l'écran le pose : qui agit, et ce qui lui est donné pour le faire.
function ligneDeManque(manque: ManqueJuge, etapes: EtapeVue[]): LigneDeManque {
  if (manque.acteur === "brigade") return { texte: manque.texte, acteur: "brigade", qui: "brigade, on its own — nothing for you to do", geste: null };
  const geste =
    manque.action !== null
      ? { action: manque.action, libelle: libelleDAction(manque.action, etapes) }
      : manque.commande !== null
        ? { commande: manque.commande }
        : manque.geste !== null
          ? { dit: manque.geste }
          : null;
  return { texte: manque.texte, acteur: "chef", qui: "you", geste };
}
const LIGNES: Readonly<Record<string, (projet: Projet) => string[]>> = {
  ajout: () => ["The app marks this step done as soon as the box answers for the project: the add is what made it exist there."],
  init: () => [
    `\`${INIT}\` is a Claude Code session, not a command: the app opens it in this space's second, in the project's folder — the conversation is yours.`,
    "Then merge its PR on the integration branch, and say so here: the box only sees of the repository what its origin carries, and the app does not know whether it is merged.",
  ],
  verification: () => [
    `“Verify” runs \`${VERIFICATION}\` on the project's box, for you: everything missing, at once, each with what sets it up. It launches no cook and no setup, and can be replayed as often as you like.`,
    "What it says is missing on the box itself is announced at the top of this screen: the app cannot do it for you.",
  ],
  stations: () => ["Choose, among the stations the box provides, those where tickets are served, and how many cooks each runs at once: the cap has no default, it is your quota."],
  protection: () => ["“Protect” sets on GitHub the protection the runtime expects — pull request required, zero approvals, administrators included — and turns on push protection if GitHub accepts it."],
  decisions: () => ["One decision at a time: its question, its options and what each does. The box records your answer in the project's journal — no `sudo`, no drop-in."],
  demarrage: (projet) => {
    const demarrage = commandeDeDemarrage(projet);
    return [
      "“Start” has the box verify everything one last time and, only if it is green, records the installation as finished: no step is left to do after it.",
      ...("commande" in demarrage
        ? [`Then the app opens a shell in this space and writes there, without sending it: \`${demarrage.commande}\` — starting a service is a \`root\` action: your Enter sends it, and \`sudo\` asks for your password on the box if it wants one.`]
        : []),
    ];
  },
};

// Les installations, tenues tant que l'app est ouverte : ce qui est lu, ce qui est en route.
// Rien n'y fait foi — la box redit tout à la lecture suivante. Ce par quoi elles passent
// leur est donné : la box, par le passage du projet, et les deux terminaux — le second, où
// s'ouvre la session d'init, et un shell, où s'écrit le démarrage. `surGuide` reçoit chaque
// installation qui change.
export function tenirServices(options: {
  delaiMs: number;
  lancer(servi: Servi, commande: string): Promise<RenduDeBox>;
  session(projet: Projet, commande: string): Terminal;
  shell(projet: Projet, ecrit: string): Terminal;
  surGuide(guide: Guide): void;
  // L'écart minimal entre deux contrôles d'un projet installé, sauf s'il est demandé exprès :
  // la vérification joint l'origine et GitHub, et tient le passage du projet le temps de le faire.
  controleMs?: number;
}) {
  const tenus = new Map<string, Tenu>();

  // L'installation d'un projet sur sa box d'aujourd'hui : ce qui a été lu d'une autre ne vaut rien ici.
  function tenir(nom: string, hote: string): Tenu {
    const tenu = tenus.get(nom);
    if (tenu !== undefined && tenu.hote === hote) return tenu;
    const neuf: Tenu = { hote, suivi: false, lecture: { etat: "en-cours", titre: "reading the installation steps on the box…" }, annoncee: false };
    tenus.set(nom, neuf);
    return neuf;
  }

  const servi = (projet: Projet & { box: NonNullable<Projet["box"]> }): Servi => ({ nom: projet.nom, box: projet.box });

  async function jouer(projet: Projet & { box: NonNullable<Projet["box"]> }, commande: string): Promise<Joue> {
    const rendu = await options.lancer(servi(projet), commande);
    const a = new Date().toISOString();
    const { erreur } = rendu;
    const code = erreur === null ? 0 : erreur.killed !== true && (erreur.code === 1 || erreur.code === 2) ? erreur.code : undefined;
    if (code === undefined) return { a, echec: echecDe({ ...rendu, erreur: erreur as NonNullable<typeof erreur> }, options.delaiMs) };
    return { a, code, sortie: rendu.sortie, obtenu: `${rendu.lance}\n${rendu.erreurs}${rendu.sortie}\n→ exit code ${code}` };
  }

  // Ce qu'une lecture rend quand ce n'est pas la forme attendue.
  function rate(joue: Joue, commande: string): Rate {
    if ("echec" in joue) return { etat: "echec", a: joue.a, titre: titreDEchec(joue.echec, `REACHED, BUT \`${commande}\` DID NOT ANSWER`), echec: joue.echec };
    return {
      etat: "illisible",
      a: joue.a,
      titre: `THE BOX DID NOT RETURN WHAT \`${commande}\` RETURNS`,
      obtenu: joue.obtenu,
      lignes: [
        `What it returned is above, as is. The expected case: the runtime serving this project on the box predates this step — update it (${DOC}, « Mettre brigade à jour »).`,
      ],
    };
  }

  const vivant = (nom: string, tenu: Tenu) => tenus.get(nom) === tenu;
  function pousser(projet: Projet, tenu: Tenu): void {
    if (vivant(projet.nom, tenu)) options.surGuide(vue(projet, tenu));
  }

  // Les étapes, relues ; puis ce que l'étape courante demande, et — l'écran ouvert sur une
  // installation pas finie — la vérification d'ouverture, une fois.
  async function relire(projet: Projet & { box: NonNullable<Projet["box"]> }, tenu: Tenu, ajoutNote = false): Promise<void> {
    const joue = await jouer(projet, COMMANDES.etapes);
    const lues = "echec" in joue || joue.code !== 0 ? undefined : lireEtapes(joue.sortie);
    if (lues === undefined) {
      tenu.lecture = rate(joue, COMMANDES.etapes);
      tenu.etapes = undefined;
      tenu.detail = undefined;
      return pousser(projet, tenu);
    }
    tenu.lecture = { etat: "lue", a: joue.a };
    tenu.etapes = lues;
    tenu.fini = lues.courante === null;
    pousser(projet, tenu);
    // Installée : le contrôle part à côté, sans retenir ce qui a relu les étapes.
    if (lues.courante === null) void controler(projet, tenu);
    if (!deplie(tenu)) return;
    // La box vient de répondre pour ce projet, par son nom : il existe sur elle.
    if (!ajoutNote && lues.etapes.some(({ id, etat }) => id === "ajout" && etat !== "done")) {
      const notee = await jouer(projet, "installation etapes ajout faite");
      if (!("echec" in notee) && notee.code === 0) return relire(projet, tenu, true);
    }
    await lireDetail(projet, tenu);
    if (!tenu.annoncee && lues.courante !== null) {
      tenu.annoncee = true;
      await verifierPour(projet, tenu);
    }
  }

  // L'étape dont la box dit de quoi choisir : la courante, quand elle a un geste à choisir —
  // et, la courante étant le démarrage, les décisions : celles que le démarrage ne réclame
  // pas restent présentées, une à une, jusqu'à la fin de l'installation.
  function cible(tenu: Tenu): "stations" | "protection" | "decisions" | undefined {
    const courante = tenu.etapes?.courante;
    if (courante === "stations" || courante === "protection" || courante === "decisions") return courante;
    return courante === "demarrage" ? "decisions" : undefined;
  }

  // Ce que la box dit de l'étape qui a un geste à choisir.
  async function lireDetail(projet: Projet & { box: NonNullable<Projet["box"]> }, tenu: Tenu): Promise<void> {
    const id = cible(tenu);
    if (id === undefined) {
      tenu.detail = undefined;
      return;
    }
    const commande = COMMANDES[id];
    tenu.detail = { etat: "en-cours", titre: `reading \`${commande}\` on the box…` };
    pousser(projet, tenu);
    const joue = await jouer(projet, commande);
    const sortie = "echec" in joue || joue.code !== 0 ? undefined : joue.sortie;
    if (id === "stations") {
      const lu = sortie === undefined ? undefined : lireStations(sortie);
      tenu.detail = lu === undefined ? rate(joue, commande) : { etat: "lu", id, lu };
    } else if (id === "protection") {
      const lu = sortie === undefined ? undefined : lireProtection(sortie);
      tenu.detail = lu === undefined ? rate(joue, commande) : { etat: "lu", id, lu };
    } else {
      const lu = sortie === undefined ? undefined : lireCourante(sortie);
      // L'étape se passe quand le démarrage ne réclame plus rien — la décision courante n'est pas
      // réclamée : celles qui restent se posent, ou se passent.
      const faite = tenu.etapes?.etapes.find((etape) => etape.id === id)?.etat === "done";
      tenu.detail = lu === undefined ? rate(joue, commande) : { etat: "lu", id, lu, passable: !faite && (lu.courante === null || !lu.courante.reclamee) };
    }
    pousser(projet, tenu);
  }

  // `installation --json`, lancée ; l'étape « verification » notée d'après ce qu'elle dit de la
  // box : faite si rien n'y manque, en attente du chef sinon. Plantée, elle n'a rien constaté :
  // rien n'est noté.
  function verifierPour(projet: Projet & { box: NonNullable<Projet["box"]> }, tenu: Tenu): Promise<void> {
    if (tenu.verifiant !== undefined) return tenu.verifiant;
    tenu.verification = undefined;
    tenu.verifiant = (async () => {
      const jugee = jugementDe(await options.lancer(servi(projet), JUGEMENT), options.delaiMs);
      tenu.verification = jugee;
      tenu.verifiant = undefined;
      pousser(projet, tenu);
      if (jugee.etat !== "jugee" || jugee.jugement.verdict === "plantee") return;
      const surLaBox = manquesDuJugement(jugee.jugement).some(({ etape }) => etape !== null && SUR_LA_BOX.includes(etape));
      const voulu = surLaBox ? "waiting" : "done";
      if (tenu.etapes?.etapes.find(({ id }) => id === "verification")?.etat === voulu) return;
      const notee = await jouer(projet, `installation etapes verification ${voulu === "done" ? "faite" : "en-attente"}`);
      if (!("echec" in notee) && notee.code === 0) await relire(projet, tenu);
    })();
    pousser(projet, tenu);
    return tenu.verifiant;
  }

  // Le contrôle d'un projet installé : ses stations, puis la vérification entière — rien n'est
  // noté au journal. Une lecture qui ne rend pas sa forme laisse ce que la précédente avait dit.
  function controler(projet: Projet & { box: NonNullable<Projet["box"]> }, tenu: Tenu, expres = false): Promise<void> {
    if (tenu.controlant !== undefined) return tenu.controlant;
    const dernier = tenu.controle === undefined ? undefined : Date.parse(tenu.controle.a);
    if (!expres && dernier !== undefined && Date.now() - dernier < (options.controleMs ?? 0)) return Promise.resolve();
    tenu.controlant = (async () => {
      try {
        const joue = await jouer(projet, COMMANDES.stations);
        const stations = "echec" in joue || joue.code !== 0 ? undefined : lireStations(joue.sortie);
        const jugee = jugementDe(await options.lancer(servi(projet), JUGEMENT), options.delaiMs);
        const lu = jugee.etat === "jugee" && jugee.jugement.verdict !== "plantee" ? jugee.jugement : undefined;
        const manques = lu === undefined ? undefined : manquesDuJugement(lu);
        const avant = tenu.controle;
        const lues = stations ?? avant?.stations;
        const dits = manques ?? avant?.manques;
        // Une vérification lue qui ne dit plus d'échec lève l'alerte ; une lecture ratée laisse l'ancienne.
        const renouvellement = lu === undefined ? avant?.renouvellement : renouvellementDe(lu.aSavoir.map(({ texte }) => `  à savoir  ${texte}`).join("\n"));
        // Ce que l'écran Verify poserait : la bande d'alertes dit le même verdict, les mêmes manques.
        const etapes = (tenu.etapes?.etapes ?? []).map((etape, rang) => ({ ...etape, rang: rang + 1 })) as EtapeVue[];
        const verification = jugee.etat === "sans-verdict" ? avant?.verification : montrer(jugee, etapes);
        tenu.controle = {
          a: new Date().toISOString(),
          ...(lues === undefined ? {} : { stations: lues }),
          ...(dits === undefined ? {} : { manques: dits }),
          ...(renouvellement === undefined ? {} : { renouvellement }),
          ...(verification === undefined ? {} : { verification }),
        };
      } finally {
        tenu.controlant = undefined;
      }
      pousser(projet, tenu);
    })();
    return tenu.controlant;
  }

  const deplie = (tenu: Tenu) => tenu.suivi || (tenu.etapes !== undefined && tenu.etapes.courante !== null && tenu.etapes.etapes.some(({ etat }) => etat !== "todo"));

  function vue(projet: Projet, tenu: Tenu): Guide {
    const lues = tenu.etapes;
    const jugee = tenu.verification;
    const manques = jugee?.etat === "jugee" ? manquesDuJugement(jugee.jugement) : [];
    const etapes: EtapeVue[] = (lues?.etapes ?? []).map((etape, rang) => {
      const courante = etape.id === lues?.courante;
      return {
        ...etape,
        rang: rang + 1,
        courante,
        manques: manques.filter((manque) => manque.etape === etape.id),
        lignes: courante ? (LIGNES[etape.id]?.(projet) ?? []) : [],
        ...(etape.id === cible(tenu) && tenu.detail !== undefined ? { detail: tenu.detail } : {}),
      };
    });
    const faites = etapes.filter(({ etat }) => etat === "done").length;
    const courante = etapes.find((etape) => etape.courante);
    const demarrage = commandeDeDemarrage(projet);
    const titre =
      tenu.lecture.etat === "en-cours"
        ? `Installation — ${tenu.lecture.titre}`
        : tenu.lecture.etat !== "lue"
          ? "Installation — the box did not return its steps"
          : courante === undefined
            ? `Installation — finished: the ${etapes.length} steps are done`
            : `Installation — ${faites} of ${etapes.length} steps done · now: ${courante.rang}. ${courante.titre}`;
    // Sans parole de la box (lecture en échec) sur un projet dont on n'a jamais vu l'installation
    // inachevée ni entamé les gestes, rien ne dit qu'elle l'est : l'écran ne s'affiche pas.
    const termine = tenu.fini === true || (tenu.fini === undefined && !tenu.suivi && tenu.lecture.etat !== "en-cours" && tenu.lecture.etat !== "lue");
    return {
      projet: projet.nom,
      termine,
      deplie: deplie(tenu),
      titre,
      lecture: tenu.lecture,
      etapes,
      courante: lues?.courante ?? null,
      annonces: annonces(projet, tenu, etapes, manques),
      ...(tenu.verifiant !== undefined
        ? { verification: { etat: "en-cours", titre: `verification running… \`${VERIFICATION}\` reaches the repository's origin and GitHub: a few seconds, two minutes at most` } }
        : jugee === undefined
          ? {}
          : { verification: montrer(jugee, etapes) }),
      ...(tenu.action === undefined ? {} : { action: tenu.action }),
      ...(tenu.fait === undefined ? {} : { fait: tenu.fait }),
      demarrage,
      ...(tenu.fini === true && tenu.controle !== undefined ? { controle: tenu.controle } : {}),
    };
  }

  // Ce que le chef aura à faire lui-même, dit avant qu'il le rencontre : le geste de chaque
  // étape qui en a un, ce que la vérification dit manquer à la box, et le démarrage du service.
  function annonces(projet: Projet, tenu: Tenu, etapes: EtapeVue[], manques: Manque[]): Guide["annonces"] {
    if (tenu.etapes === undefined || tenu.etapes.courante === null) return { etat: "lues", liste: [] };
    const liste: Annonce[] = [];
    for (const etape of etapes) if (etape.geste !== null && etape.etat !== "done") liste.push({ titre: `${etape.rang}. ${etape.titre}`, texte: etape.geste, geste: null });
    for (const manque of manques) {
      if (manque.etape !== null && SUR_LA_BOX.includes(manque.etape)) liste.push({ titre: "On the box, by someone with `sudo` there", texte: manque.texte, geste: manque.geste });
    }
    const demarrage = commandeDeDemarrage(projet);
    const derniere = etapes.at(-1);
    if ("commande" in demarrage && derniere !== undefined) {
      liste.push({
        titre: `${derniere.rang}. ${derniere.titre}`,
        texte: "Starting the service is a `root` action that no gesture of the box gives without a password: the app writes it in a shell of this space, and your Enter sends it — once the box has said everything is green.",
        geste: demarrage.commande,
      });
    }
    const jugee = tenu.verification;
    const etat = tenu.verifiant !== undefined || !tenu.annoncee ? "en-cours" : jugee?.etat === "jugee" && jugee.jugement.verdict !== "plantee" ? "lues" : "pas-lues";
    return { etat, liste };
  }

  // Ce que l'écran pose d'une vérification : le verdict en une phrase, une ligne par manque avec
  // qui agit, les lignes « à savoir » à part, et la sortie brute, repliée. Pas de mode d'emploi :
  // ce que la box a rendu est dit en mots simples, ou n'est pas dit.
  function montrer(jugee: Jugee, etapes: EtapeVue[]): Montree {
    const { a } = jugee;
    if (jugee.etat === "sans-verdict") {
      const { erreur, atteinte, cas } = jugee;
      return { etat: "sans-verdict", a, titre: titreDEchec({ erreur, atteinte, cas }, `REACHED, BUT \`${JUGEMENT}\` DID NOT RETURN ITS VERDICT`), echec: { erreur, atteinte, cas } };
    }
    if (jugee.etat === "illisible") {
      return {
        etat: "illisible",
        a,
        titre: `The box did not return the verdict of \`${JUGEMENT}\`: the app cannot say whether the project is ready.`,
        detail: jugee.obtenu,
        suite: [
          `The expected case: the runtime serving this project on the box predates this verdict — update it (${DOC}, « Mettre brigade à jour »).`,
          `Or your account on the box is locked into a forced command, which replaces the one the app sends — ${DOC}, « Ajouter un humain ».`,
        ],
      };
    }
    const { jugement, obtenu } = jugee;
    const commun = { a, titre: jugement.phrase, detail: obtenu };
    if (jugement.verdict === "plantee") {
      const { connue } = jugement.panne;
      return { etat: "plantee", ...commun, manques: [], panne: connue === null ? null : `#${connue.issue} — ${connue.texte}`, aSavoir: [] };
    }
    const manques = jugement.verdict === "pas-pret" ? jugement.manques.map((manque) => ligneDeManque(manque, etapes)) : [];
    return { etat: jugement.verdict, ...commun, manques, panne: null, aSavoir: jugement.aSavoir };
  }

  // Ce qui réclame un terminal : la raison, pour un projet qui n'en a pas.
  const sansTerminal = (projet: Projet) => (projet.box === undefined ? sansBox(projet.nom) : projet.refus === undefined ? undefined : `“${projet.nom}” does not open: ${projet.refus}`);

  // Une action de l'écran sur la box : une à la fois par projet. Ce que la box en dit est
  // gardé tel quel, puis tout est relu — c'est elle qui dit où en est l'installation.
  async function agir(projet: Projet, quoi: string, faire: (projet: Projet & { box: NonNullable<Projet["box"]> }, tenu: Tenu) => Promise<Fait | { refus: string }>): Promise<{ refus: string } | undefined> {
    const { box } = projet;
    if (box === undefined) return { refus: sansBox(projet.nom) };
    const avec = { ...projet, box };
    const tenu = tenir(projet.nom, box.hote);
    if (tenu.action !== undefined || tenu.verifiant !== undefined) return { refus: OCCUPE };
    tenu.suivi = true;
    tenu.action = quoi;
    pousser(projet, tenu);
    try {
      const fait = await faire(avec, tenu);
      if ("refus" in fait) return fait;
      tenu.fait = fait;
      await relire(avec, tenu);
      return undefined;
    } finally {
      tenu.action = undefined;
      pousser(projet, tenu);
    }
  }

  // Une commande du runtime qui écrit, et ce qu'elle en a dit.
  async function ecrire(projet: Projet & { box: NonNullable<Projet["box"]> }, commande: string, titres: { ok: string; non: string }): Promise<Fait> {
    const joue = await jouer(projet, commande);
    if ("echec" in joue) return { a: joue.a, ok: false, titre: `${titres.non} — ${titreDEchec(joue.echec, `REACHED, BUT \`${commande}\` DID NOT ANSWER`)}`, obtenu: joue.echec.erreur };
    return { a: joue.a, ok: joue.code === 0, titre: joue.code === 0 ? titres.ok : titres.non, obtenu: joue.obtenu };
  }

  // Le détail lu de cette étape — rien, si ce n'est pas elle qui a un geste à choisir, ou si la box ne l'a pas rendu.
  function detail<I extends "stations" | "protection" | "decisions">(tenu: Tenu, id: I): Extract<Detail, { id: I }> | undefined {
    const lu = tenu.detail;
    return cible(tenu) === id && lu?.etat === "lu" && lu.id === id ? (lu as Extract<Detail, { id: I }>) : undefined;
  }

  // Une valeur que l'app porte à la box : de quoi n'être qu'un mot pour son shell.
  const VALEUR = /^[A-Za-z0-9._-]{1,64}$/;

  // L'installation d'un projet, relue sur sa box — rien, pour un projet sans box. Ouverte,
  // ou en cours, ce que son étape courante demande est lu aussi, et la vérification
  // d'ouverture part une fois : ce qui sera au chef est annoncé sans qu'il ait rien pressé.
  async function guide(projet: Projet): Promise<Guide | undefined> {
    if (projet.box === undefined) return undefined;
    const tenu = tenir(projet.nom, projet.box.hote);
    pousser(projet, tenu);
    await relire({ ...projet, box: projet.box }, tenu);
    return vue(projet, tenu);
  }

  return {
    guide,

    // Le contrôle d'un projet installé — l'app le relance à son rythme, quel que soit l'écran, et
    // pas plus souvent que `controleMs` : si la box dit l'installation terminée, ce qu'il a perdu.
    // Une installation pas finie n'en est pas touchée : rien n'y est lu de plus, rien noté.
    // `expres` : demandé par le chef, l'écart minimal ne le retient pas.
    // Rend le contrôle tel qu'il en sort — rien, pour un projet sans box ou pas installé.
    async controler(projet: Projet, expres = false): Promise<Controle | undefined> {
      if (projet.box === undefined) return undefined;
      const avec = { ...projet, box: projet.box };
      const tenu = tenir(projet.nom, projet.box.hote);
      if (tenu.fini !== true) {
        // Terminée depuis la dernière lecture — ailleurs que dans l'app : l'écran l'apprend aussi.
        const joue = await jouer(avec, COMMANDES.etapes);
        const lues = "echec" in joue || joue.code !== 0 ? undefined : lireEtapes(joue.sortie);
        if (lues?.courante !== null || !vivant(projet.nom, tenu)) return undefined;
        tenu.lecture = { etat: "lue", a: joue.a };
        tenu.etapes = lues;
        tenu.fini = true;
        tenu.detail = undefined;
        pousser(projet, tenu);
      }
      if (!vivant(projet.nom, tenu)) return undefined;
      await controler(avec, tenu, expres);
      return tenu.controle;
    },

    // Le chef ouvre l'écran replié, ou le projet vient d'être ajouté par l'écran d'ajout.
    deplier(projet: Projet): Promise<Guide | undefined> {
      if (projet.box !== undefined) tenir(projet.nom, projet.box.hote).suivi = true;
      return guide(projet);
    },

    // Le projet vient d'être ajouté par l'écran : son installation s'ouvre d'elle-même dans son espace.
    suivre(projet: Projet): void {
      if (projet.box !== undefined) tenir(projet.nom, projet.box.hote).suivi = true;
    },

    // La session `/brigade:init`, dans le second du projet. Rien n'en est déduit : qu'elle ait
    // abouti, et que son résultat soit mergé, c'est le chef qui le dit.
    amorcer(projet: Projet): Terminal | { refus: string } {
      const refus = sansTerminal(projet);
      if (refus !== undefined || projet.box === undefined) return { refus: refus ?? sansBox(projet.nom) };
      tenir(projet.nom, projet.box.hote).suivi = true;
      return options.session(projet, INIT);
    },

    // Le chef dit le résultat de l'init mergé — ou s'en dédit : la box le note, ou le remet à faire.
    direMerge(projet: Projet, merge: boolean) {
      return agir(projet, merge ? "recording the merge of the init…" : "putting the init back to do…", (avec) =>
        ecrire(avec, `installation etapes init ${merge ? "faite" : "a-faire"}`, merge ? { ok: `The merge of \`${INIT}\` is recorded on the box`, non: "The box did not record the merge" } : { ok: "The init is back to do", non: "The box did not put the init back to do" }),
      );
    },

    // Lance `installation`, et rend l'installation telle qu'elle en sort : son verdict, et
    // l'étape « verification » notée d'après lui. Une vérification en route ne se double pas.
    async verifier(projet: Projet): Promise<{ refus: string } | undefined> {
      if (projet.box === undefined) return { refus: sansBox(projet.nom) };
      const tenu = tenir(projet.nom, projet.box.hote);
      if (tenu.action !== undefined) return { refus: OCCUPE };
      tenu.suivi = true;
      tenu.annoncee = true;
      await verifierPour({ ...projet, box: projet.box }, tenu);
      return undefined;
    },

    // Déclare les stations choisies parmi celles que la box fournit, chacune à son plafond de
    // cooks. `choix` : ce que la vue a recueilli — rien n'y est cru sur parole.
    declarerStations(projet: Projet, choix: unknown) {
      return agir(projet, "declaring the stations…", async (avec, tenu) => {
        const lu = detail(tenu, "stations")?.lu;
        if (lu === undefined) return { refus: "Nothing was declared: the box has not said which stations it provides — read the steps again." };
        const voulues = Array.isArray(choix) ? (choix as unknown[]) : [];
        const entrees: string[] = [];
        for (const voulue of voulues) {
          const { nom, cooks } = (voulue ?? {}) as Lu;
          const proposee = lu.proposees.find((station) => station.nom === nom);
          if (proposee === undefined) return { refus: `Nothing was declared: “${String(nom)}” is not a station the box provides.` };
          if (typeof cooks !== "number" || !Number.isInteger(cooks) || cooks < 1 || cooks > 99) return { refus: `Nothing was declared: how many cooks “${proposee.nom}” runs at once has no default — a whole number, 1 or more.` };
          entrees.push(`${proposee.nom}:${cooks}:${proposee.fournit.join("+")}`);
        }
        if (entrees.length === 0) return { refus: "Nothing was declared: choose at least one station — without one, no cook leaves." };
        const declaration = entrees.join(",");
        if (!/^[A-Za-z0-9/:+,._-]+$/.test(declaration)) return { refus: "Nothing was declared: the box provides a station whose name the app does not carry safely." };
        return ecrire(avec, `installation stations ${declaration}`, { ok: "Stations declared", non: "The box refused the stations" });
      });
    },

    // Protège la branche d'intégration sur GitHub, par le compte de `gh` de la box.
    proteger(projet: Projet) {
      return agir(projet, "protecting the integration branch…", (avec) => ecrire(avec, "installation protection poser", { ok: "Integration branch protected", non: "The integration branch is not protected" }));
    },

    // Répond à la décision courante — deux valeurs quand elle se répond avec une autre.
    repondre(projet: Projet, valeurs: unknown) {
      return agir(projet, "recording your answer…", async (avec, tenu) => {
        const courante = detail(tenu, "decisions")?.lu.courante;
        if (courante === undefined || courante === null) return { refus: "Nothing was answered: the box has no decision waiting — read the steps again." };
        const attendues = courante.avec === null ? 1 : 2;
        const lues = Array.isArray(valeurs) ? (valeurs as unknown[]).map((valeur) => (typeof valeur === "string" ? valeur.trim() : "")) : [];
        if (lues.length !== attendues || lues.some((valeur) => valeur === "")) return { refus: `Nothing was answered: ${courante.nom} takes ${attendues === 1 ? "one value" : `two values — its own, and ${courante.avec?.nom}'s`}.` };
        const refusee = lues.find((valeur) => !VALEUR.test(valeur));
        if (refusee !== undefined) return { refus: `Nothing was answered: “${refusee}” is not a value the box reads — letters, digits, dots and hyphens.` };
        return ecrire(avec, `installation decisions courante ${lues.join(" ")}`, { ok: `${courante.nom} recorded`, non: `The box refused the answer to ${courante.nom}` });
      });
    },

    // Les décisions qui restent, le démarrage ne les réclamant pas : l'étape est notée faite, elles restent à poser plus tard.
    passerDecisions(projet: Projet) {
      return agir(projet, "moving past the optional decisions…", async (avec, tenu) => {
        const lu = detail(tenu, "decisions");
        if (lu === undefined || tenu.etapes?.courante !== "decisions") return { refus: "Nothing to skip: the decisions step is not the current one." };
        if (!lu.passable) return { refus: "Not skipped: the start still requires a decision — answer it first." };
        return ecrire(avec, "installation etapes decisions faite", { ok: "Decisions step done — the remaining ones are optional", non: "The box did not mark the decisions step done" });
      });
    },

    // « Démarrer » : la box revérifie tout et termine l'installation si c'est vert ; alors
    // seulement, le démarrage du service est écrit dans un shell de l'espace, sans l'envoyer.
    async demarrer(projet: Projet): Promise<Terminal | { refus: string }> {
      const refus = sansTerminal(projet);
      if (refus !== undefined || projet.box === undefined) return { refus: refus ?? sansBox(projet.nom) };
      const demarrage = commandeDeDemarrage(projet);
      if ("refus" in demarrage) return demarrage;
      const tenu = tenir(projet.nom, projet.box.hote);
      if (tenu.etapes?.courante !== null) {
        if (tenu.etapes?.courante !== "demarrage") return { refus: "Nothing is written: the installation is not at its last step — finish the current one first." };
        let fini = false;
        const refuse = await agir(projet, "the box verifies everything one last time…", async (avec) => {
          const fait = await ecrire(avec, "installation etapes demarrage faite", { ok: "Installation finished — the kitchen is ready to serve", non: "The installation is not finished" });
          fini = fait.ok;
          return fait;
        });
        if (refuse !== undefined) return refuse;
        if (!fini) return { refus: "Nothing is written: the box did not say everything is green — what is missing is in the installation, under the step to resume." };
      }
      return options.shell(projet, demarrage.commande);
    },

    // Le dernier contrôle lu d'un projet installé, sans rien relancer : « + shell » y prend les
    // stations que la box déclare. Rien, tant qu'aucun n'a été lu.
    controleDe(nom: string): Controle | undefined {
      const tenu = tenus.get(nom);
      return tenu?.fini === true ? tenu.controle : undefined;
    },

    // Le projet a quitté la liste : rien n'est gardé de son installation.
    oublier(nom: string): void {
      tenus.delete(nom);
    },
  };
}
