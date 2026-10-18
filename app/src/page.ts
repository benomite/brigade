// La page d'un worktree servi : quand `status` montre un serveur — une livraison
// d'interface, servie depuis son worktree sur le port de ce worktree —, un geste
// l'ouvre dans le navigateur du poste, celui du chef, avec ses sessions.
//
// Le port n'écoute que sur la box. L'app l'amène sur ce poste par le `ssh` qu'elle
// a déjà : un transfert de port, vers la même box, sans aucune commande à y lancer
// (`-N`) — rien n'y demande un droit de plus. Puis elle ouvre l'adresse locale, par
// la commande d'ouverture du poste. Elle relaie des octets : elle ne montre pas la
// page, n'en lit et n'en capture rien, et ne recueille aucun avis — le verdict se
// dit sur l'issue.
//
// Ce qui est servi, l'app le lit là où le runtime le montre : sous la ligne
// `serveurs` de `status`, une ligne par serveur. Rien d'autre n'y est lu, et rien
// n'y est deviné : sans cette ligne il n'y a pas de geste, et l'app dit pourquoi.
// Le geste ouvre la page que cette ligne écrit — l'écran que la livraison a changé,
// le port de son worktree suivi de la route de l'écran — et elle seule : une ligne
// qui n'en écrit aucune, ou n'écrit que la racine du site, n'a pas de geste. Jamais
// la racine d'un worktree, qu'un serveur de fichiers rend en liste de dossier.
//
// Sous chaque ligne, plus en retrait, `status` dit l'écran à regarder et qui l'a dit
// — le cook, ou une déduction des fichiers touchés —, puis la phrase du cook :
// la carte du ticket les pose tels quels. Et sous la ligne `à lancer`, les livraisons
// d'une app qui ne s'ouvre pas dans un navigateur : aucune page, aucun geste, mais
// comment voir l'écran, tel que `status` le dit.
// Un transfert ne dure pas plus que ce qui le justifie : il est fermé dès qu'une
// lecture de `status` ne montre plus son serveur, quand son projet quitte l'app, et
// quand l'app ferme.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { connect, createServer, type AddressInfo, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Montree } from "./attend.ts";
import type { Reglages, Servi } from "./box.ts";
import type { Projet } from "./config.ts";
import { nombre } from "./format.ts";

// L'écran à regarder d'une livraison, tel que `status` le dit sous sa ligne
// (runtime/src/projections/service.ts, `direEcran`) : `nom`, l'écran ou la route ;
// `phrase`, ce qu'il faut y regarder — nulle, personne ne l'a dit ; `deduit`, ce que
// `status` dit d'un écran que le cook n'a pas déclaré, mot pour mot — nul quand il l'a déclaré.
export type Ecran = { nom: string; phrase: string | null; deduit: string | null };

// Un serveur, tel que `status` l'écrit (runtime/src/etat.ts, `decrireServeurs`) :
// `  #<ticket>  <worktree>  port <port>  <état> depuis <durée>  <branche>  <page>`.
// `worktree` : relatif au répertoire d'état de la box — un serveur par worktree, c'est lui qui le nomme.
// `route` : celle de la page que la ligne écrit, sur le port de ce worktree — nulle quand elle
// n'en écrit aucune, ou que la racine. `sansPage` : ce que la ligne écrit à sa place, mot pour
// mot — absent quand elle n'écrit rien. `ecran` : nul quand `status` n'en dit aucun.
export type Serveur = { ticket: number; worktree: string; port: number; etat: string; route: string | null; sansPage?: string; ecran: Ecran | null };
// Une livraison d'une app qui ne s'ouvre pas dans un navigateur, telle que `status` l'écrit
// sous sa ligne `à lancer` : `  #<ticket>  <worktree>  tenu depuis <durée>  <branche>  <comment le voir>`.
// `commentLeVoir` : ce que `status` en dit, mot pour mot — la commande qui lance l'app sur ce
// worktree et l'écran à y ouvrir, ou qu'il n'y a rien à regarder.
export type ALancer = { ticket: number; worktree: string; commentLeVoir: string; ecran: Ecran | null };
// `entete` : ce que la ligne `serveurs` dit d'eux tous — absente, `status` n'en montre aucun.
// `illisibles` : les lignes sous elle, ou sous `à lancer`, qui n'ont pas leur forme, telles quelles.
// `empeche` : ce que les lignes `service` disent, mot pour mot — ce qui empêche le projet d'être servi.
export type Lus = { entete?: string; serveurs: Serveur[]; aLancer: ALancer[]; illisibles: string[]; empeche: string[] };

// `status` s'écrit en français ou en anglais (#939) : chaque forme est lue sous les deux, en entier —
// une ligne qui mêle les deux langues dans une même forme n'est la forme d'aucune. Elle donne le même résultat.
const SERVEUR = /^ {2}#(\d+) {2}(\S.*?) {2}port (\d+) {2}(?!starting |listening )(\S+) depuis /;
const SERVER = /^ {2}#(\d+) {2}(\S.*?) {2}port (\d+) {2}(?!démarre |écoute )(\S+) since /;
// La fin de la ligne d'un serveur : la durée, la branche, puis la page — ou ce qui la remplace.
const SUITE = /^ {2}#\d+ {2}\S.*? {2}port \d+ {2}\S+ depuis .+? {2}\S+(?: {2}(.*))?$/;
const SUITE_EN = /^ {2}#\d+ {2}\S.*? {2}port \d+ {2}\S+ since .+? {2}\S+(?: {2}(.*))?$/;
const TENU = /^ {2}#(\d+) {2}(\S.*?) {2}tenu depuis .+? {2}\S+ {2}(.+)$/;
const TENU_EN = /^ {2}#(\d+) {2}(\S.*?) {2}held since .+? {2}\S+ {2}(.+)$/;
// Sous une ligne, l'écran et sa phrase.
const ECRAN = /^ {4}écran : (.+) \((déclaré par le cook|écran déduit des fichiers touchés, pas déclaré par le cook)\)$/;
const SCREEN = /^ {4}screen: (.+) \((declared by the cook|screen deduced from the touched files, not declared by the cook)\)$/;
const PHRASE = /^ {4}à regarder : (.+)$/;
const SENTENCE = /^ {4}to look at: (.+)$/;
const DECLARE = new Set(["déclaré par le cook", "declared by the cook"]);
// Ce que `status` dit d'un écran que le cook n'a pas déclaré, dans l'une ou l'autre langue : l'app le garde en anglais.
const DEDUIT = "screen deduced from the touched files, not declared by the cook";
// L'état d'un serveur, dans l'une ou l'autre langue : l'app le garde en anglais — un autre mot est gardé tel quel.
const ETAT_DU_SERVEUR: Record<string, string> = { démarre: "starting", écoute: "listening" };

// La route de la page qu'une ligne écrit, si c'est une page de ce worktree — son port, sur la
// boucle locale — et pas sa racine. Rien n'est deviné : une adresse qui n'a pas cette forme n'en est pas une.
function routeDe(ecrite: string | undefined, port: number): string | null {
  const [, lu, route] = /^http:\/\/127\.0\.0\.1:(\d+)(\/\S*)$/.exec(ecrite ?? "") ?? [];
  if (lu === undefined || route === undefined || Number(lu) !== port) return null;
  return route === "/" || route.startsWith("//") || route.includes("\\") ? null : route;
}

// Les serveurs que cette sortie de `status` montre, et les livraisons à lancer. Seules les lignes
// qui suivent la ligne `serveurs`, ou `à lancer`, en sont : un titre de ticket, plus haut, n'en fait pas un.
export function serveursDe(status: string): Lus {
  const lignes = status.split("\n");
  const lus: Lus = { serveurs: [], aLancer: [], illisibles: [], empeche: [] };
  const tete = lignes.findIndex((ligne) => /^(?:serveurs|servers)\s/.test(ligne));
  if (tete !== -1) lus.entete = (lignes[tete] as string).replace(/^(?:serveurs|servers)\s+/, "");
  // Les lignes d'un bloc ; l'écran et la phrase, plus en retrait, vont à l'entrée qu'ils suivent —
  // sous une ligne illisible, ils le sont aussi.
  const bloc = (titre: RegExp, lire: (ligne: string) => { ecran: Ecran | null } | undefined) => {
    const debut = lignes.findIndex((ligne) => titre.test(ligne));
    let derniere: { ecran: Ecran | null } | undefined;
    for (let rang = debut + 1; debut !== -1 && lignes[rang]?.startsWith("  ") === true; rang++) {
      const ligne = lignes[rang] as string;
      if (ligne.startsWith("    ")) {
        const [, nom, source] = ECRAN.exec(ligne) ?? SCREEN.exec(ligne) ?? [];
        const [, phrase] = PHRASE.exec(ligne) ?? SENTENCE.exec(ligne) ?? [];
        if (derniere !== undefined && nom !== undefined && source !== undefined && derniere.ecran === null) derniere.ecran = { nom, phrase: null, deduit: DECLARE.has(source) ? null : DEDUIT };
        else if (derniere?.ecran != null && phrase !== undefined && derniere.ecran.phrase === null) derniere.ecran.phrase = phrase;
        else lus.illisibles.push(ligne);
        continue;
      }
      derniere = lire(ligne);
      if (derniere === undefined) lus.illisibles.push(ligne);
    }
  };
  bloc(/^(?:serveurs|servers)\s/, (ligne) => {
    const [, ticket, worktree, port, ecrit] = SERVEUR.exec(ligne) ?? SERVER.exec(ligne) ?? [];
    const etat = ecrit === undefined ? undefined : (ETAT_DU_SERVEUR[ecrit] ?? ecrit);
    const lisible = ticket !== undefined && worktree !== undefined && port !== undefined && etat !== undefined && Number.isSafeInteger(Number(ticket)) && Number(port) >= 1 && Number(port) <= 65535;
    // Un worktree n'a qu'un serveur : une seconde ligne à son nom ne dit pas lequel ouvrir.
    if (!lisible || lus.serveurs.some((lu) => lu.worktree === worktree)) return undefined;
    const ecrite = (SUITE.test(ligne) ? SUITE : SUITE_EN).exec(ligne)?.[1];
    const route = routeDe(ecrite, Number(port));
    const serveur: Serveur = { ticket: Number(ticket), worktree, port: Number(port), etat, route, ...(route === null && ecrite !== undefined && ecrite !== "" && !/^https?:/.test(ecrite) ? { sansPage: ecrite } : {}), ecran: null };
    lus.serveurs.push(serveur);
    return serveur;
  });
  bloc(/^(?:à lancer|to launch)\s/, (ligne) => {
    const [, ticket, worktree, commentLeVoir] = TENU.exec(ligne) ?? TENU_EN.exec(ligne) ?? [];
    if (ticket === undefined || worktree === undefined || commentLeVoir === undefined || !Number.isSafeInteger(Number(ticket)) || lus.aLancer.some((lu) => lu.worktree === worktree)) return undefined;
    const tenu: ALancer = { ticket: Number(ticket), worktree, commentLeVoir, ecran: null };
    lus.aLancer.push(tenu);
    return tenu;
  });
  for (const ligne of lignes) if (/^service\s/.test(ligne)) lus.empeche.push(ligne.replace(/^service\s+/, ""));
  return lus;
}

// Ce que le dernier geste a donné pour un serveur : la page ouverte, ou pourquoi elle ne l'est pas.
export type Dit = { ouverte: boolean; texte: string };
// Un serveur que `status` montre, et son geste. Sans `route`, il n'en a aucun — pas même
// inactif : `sansPage` dit pourquoi. `raison` : absente, le geste est posé ; sinon,
// pourquoi il ne l'est pas. `enCours` : le geste est parti, et n'a pas encore abouti.
// `dit` : ce que le dernier a donné, tant que le serveur est montré.
export type Page = Serveur & { raison?: string; enCours: boolean; dit?: Dit };
// Ce que la vue pose d'un projet, prêt à poser : elle n'y calcule rien.
// `vide` : ce qui se lit à la place des gestes quand il n'y en a aucun.
// `rappel` : où se dit le verdict — posé avec les gestes, et seulement avec eux.
// `refus` : pourquoi le geste qui vient d'être demandé n'est pas parti.
// `aLancer` : les livraisons d'une app qui ne s'ouvre pas dans un navigateur — sans geste.
export type Pages = { projet: string; pages: Page[]; aLancer: ALancer[]; illisibles: string[]; empeche: string[]; vide?: string; rappel?: string; refus?: string };

// Le mot par lequel `status` dit qu'un port répond, et celui par lequel il dit des
// serveurs dont le runtime est mort (runtime/src/projections/service.ts, runtime/src/etat.ts).
const ECOUTE = "listening";
const SANS_FIN = "with no end in the log";
const SANS_FIN_FR = "sans fin au journal";
// Le geste de poste, tel que faits.ts l'écrit sans le projet : la vue le pose sur le sien.
const STATUS = "`ssh <hote> brigade <nom> status`";

const RAPPEL = "The app opens the page in your browser: it does not show it, and collects no opinion. Your yes or no is given on the ticket's issue — its number opens it, on the rail.";
const PAS_LU = `no page to open: ${STATUS} has not been read — what the app got instead is below. This is not “no server”`;
const AUCUN = `no page to open: ${STATUS} shows no server for this project. A server is only started for a delivery that touches the interface, from its worktree, on a project that declares how it is served`;
const EMPECHE = `no page to open: ${STATUS} shows no server, and says what keeps this project from being served:`;
const ILLISIBLE = `no page to open: under its \`serveurs\` line, ${STATUS} writes what the app could not read — it opens nothing from a line it does not understand:`;
const PLUS_MONTRE = `nothing opened: ${STATUS} no longer shows this server`;
const SANS_ROUTE = `no page to open: ${STATUS} writes no screen page for this server — the app never opens the root of a worktree, which a file server shows as a folder listing`;

// Pourquoi ce serveur n'a pas de geste — rien, s'il en a un. Un port qui ne
// répond pas encore n'ouvrirait qu'une erreur ; un serveur dont le runtime est
// mort n'a plus personne pour dire s'il répond.
function raisonDe({ entete }: Lus, { etat }: Serveur): string | undefined {
  if ((entete?.includes(SANS_FIN) === true || entete?.includes(SANS_FIN_FR) === true)) return `no action: ${STATUS} says these servers are “${SANS_FIN}” — their runtime stopped without shutting them down, and nothing says whether they answer`;
  if (etat !== ECOUTE) return `no action: ${STATUS} says “${etat}”, not “${ECOUTE}” — nothing says its port answers on the box. The action comes with the read that says so`;
  return undefined;
}

// Un port de ce poste amené jusqu'à celui d'un worktree, sur la box. `local` : ce port — la page
// s'y ouvre sur la route de son écran, jamais à sa racine. `fini` : `ssh` est sorti, le transfert n'est plus.
export type Transfert = { local: number; fini: Promise<void>; fermer(): void };

// La cadence à laquelle la prise de `ssh` est sondée tant qu'il s'installe.
const SONDE_MS = 100;
const SORTIE_MAX = 16 * 1024;

// Le port de ce poste, ouvert par l'app et tenu par elle : le numéro du worktree s'il
// est libre — l'adresse est alors celle que `station` écrit, et la page se croit chez
// elle —, sinon un port que le poste donne. Rien, si le poste n'en donne aucun.
async function tenirPort(prefere: number): Promise<Server | undefined> {
  for (const port of [prefere, 0]) {
    const relais = createServer();
    const ouvert = await new Promise<boolean>((resoudre) => {
      relais.on("error", () => resoudre(false));
      relais.listen(port, "127.0.0.1", () => resoudre(true));
    });
    if (ouvert) return relais;
  }
  return undefined;
}

// Amène le port d'un worktree de la box sur ce poste, et rend la main quand il y
// répond. Jamais d'exception : ce qui l'a empêché est rendu, avec ce que `ssh` a dit.
//
// L'app ouvre elle-même le port de ce poste, et `ssh` ouvre le transfert sur une prise
// posée dans un répertoire qui n'est qu'à ce compte ; l'app relaie de l'un à l'autre, sans
// rien y lire. Seul ce `ssh` peut ouvrir cette prise : quand elle répond, c'est lui, et la
// box est jointe — un port de ce poste qui répondrait ne dirait pas à qui il est.
// Le `ssh` lancé est celui de l'app, tué par son pid — `fermer`, ou `signal` tant qu'il s'installe.
export async function ouvrirTransfert(reglages: Reglages, { box }: Servi, port: number, signal?: AbortSignal): Promise<Transfert | { refus: string }> {
  const ABANDON = "nothing opened: the action was abandoned — its project left the app, or the app is closing";
  if (signal?.aborted === true) return { refus: ABANDON };
  const relais = await tenirPort(port);
  if (relais === undefined) return { refus: "nothing opened: this workstation gave no port to bring the worktree's port to" };
  const local = (relais.address() as AddressInfo).port;
  const venues = new Set<Socket>();
  let dossier: string | undefined;
  let range = false;
  // Plus rien ne reste du transfert sur ce poste : ni son port, ni sa prise.
  const ranger = () => {
    if (range) return;
    range = true;
    relais.close();
    for (const venue of venues) venue.destroy();
    try {
      if (dossier !== undefined) rmSync(dossier, { recursive: true, force: true });
    } catch {
      // Un répertoire temporaire qui reste n'empêche rien.
    }
  };
  try {
    dossier = mkdtempSync(join(tmpdir(), "brigade-page-"));
    const prise = join(dossier, "ssh");
    // Les options de la veille (box.ts) : sans terminal, `ssh` échoue plutôt que d'attendre un mot de
    // passe. Le transfert a sa propre connexion — partagée, il survivrait à ce process —, et une prise
    // qu'il ne peut pas ouvrir le fait sortir. Après l'hôte, rien : aucune commande ne part vers la box.
    const args = ["-o", "BatchMode=yes", "-o", `ConnectTimeout=${reglages.connexionS}`, "-o", "ControlPath=none", "-o", "ExitOnForwardFailure=yes", "-N", "-L", `${prise}:127.0.0.1:${port}`, "--", box.hote];
    const lance = `$ ${reglages.ssh} ${args.join(" ")}`;
    const enfant = spawn(reglages.ssh, args, { stdio: ["ignore", "ignore", "pipe"] });
    let erreurs = "";
    enfant.stderr.on("data", (morceau: Buffer) => void (erreurs = (erreurs + morceau.toString()).slice(-SORTIE_MAX)));
    // Sa fin, dite : son code, son signal — ou pourquoi il n'a pas pu être lancé.
    const fin = new Promise<string>((resoudre) => {
      enfant.once("error", (erreur) => resoudre(erreur.message));
      enfant.once("close", (code, arret) => resoudre(code === null ? `stopped by ${arret}` : `exit code ${code}`));
    });
    const fini = fin.then(ranger);
    const obtenu = (suite: string) => [lance, erreurs.trimEnd(), `→ ${suite}`].filter(Boolean).join("\n");
    relais.on("connection", (venue) => {
      const vers = connect(prise);
      venues.add(venue);
      venue.once("close", () => venues.delete(venue));
      venue.on("error", () => vers.destroy());
      vers.on("error", () => venue.destroy());
      venue.pipe(vers).pipe(venue);
    });

    return await new Promise<Transfert | { refus: string }>((resoudre) => {
      let conclu = false;
      let sonde: NodeJS.Timeout | undefined;
      const conclure = (issue: Transfert | { refus: string }) => {
        if (conclu) return;
        conclu = true;
        clearTimeout(garde);
        clearTimeout(sonde);
        signal?.removeEventListener("abort", abandonner);
        if ("refus" in issue) {
          enfant.kill();
          ranger();
        }
        resoudre(issue);
      };
      const garde = setTimeout(
        () => conclure({ refus: `nothing opened: \`ssh\` did not open the forward in ${nombre(reglages.delaiMs / 1000)} s — it is stopped\n${obtenu("stopped by the app")}` }),
        reglages.delaiMs,
      );
      const abandonner = () => conclure({ refus: ABANDON });
      signal?.addEventListener("abort", abandonner, { once: true });
      if (signal?.aborted === true) abandonner();
      void fin.then((dite) => conclure({ refus: `nothing opened: the port forward to the box did not hold — \`ssh\` exited before opening it\n${obtenu(dite)}` }));
      // La prise répond-elle ? `ssh` ne l'ouvre qu'une fois la box jointe.
      const sonder = () => {
        if (conclu) return;
        const essai = connect(prise);
        essai.once("connect", () => {
          essai.destroy();
          conclure({
            local,
            fini,
            fermer: () => {
              enfant.kill();
              ranger();
            },
          });
        });
        essai.once("error", () => {
          essai.destroy();
          if (!conclu) sonde = setTimeout(sonder, SONDE_MS);
        });
      };
      sonder();
    });
  } catch (erreur) {
    ranger();
    return { refus: `nothing opened: \`ssh\` could not be started — ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
}

type Ouvert = { hote: string; port: number; transfert: Transfert };
// Ce qui est tenu d'un projet : ce que sa dernière lecture de `status` montre — rien,
// si elle a échoué —, ses transferts ouverts et ses gestes en route, par worktree.
type Tenu = { lus?: Lus; ouverts: Map<string, Ouvert>; enCours: Map<string, Promise<void>>; dits: Map<string, Dit>; arret: AbortController };

// Les pages de chaque projet, tenues par le process principal : la vue nomme un
// projet et un worktree, jamais un port ni une adresse. Ce qui s'ouvre est le port
// que la box a montré pour ce worktree, à la dernière lecture de `status`.
export function tenirPages(options: {
  // Le transfert de port vers la box du projet — par son passage, dans l'app, comme tout ce qui la joint.
  transferer(servi: Servi, port: number, signal: AbortSignal): Promise<Transfert | { refus: string }>;
  // La commande d'ouverture du poste : son navigateur par défaut.
  ouvrir(url: string): Promise<void>;
}) {
  const tenus = new Map<string, Tenu>();
  let ferme = false;

  function tenir(nom: string): Tenu {
    let tenu = tenus.get(nom);
    if (tenu === undefined) tenus.set(nom, (tenu = { ouverts: new Map(), enCours: new Map(), dits: new Map(), arret: new AbortController() }));
    return tenu;
  }

  function poser(nom: string, refus?: string): Pages {
    const { lus, enCours, dits } = tenir(nom);
    const { serveurs, aLancer, illisibles, empeche } = lus ?? { serveurs: [], aLancer: [], illisibles: [], empeche: [] };
    const pages = serveurs.map((serveur): Page => {
      // Sans page à ouvrir, pas de geste : ce qui se lit à sa place suffit.
      if (serveur.route === null) return { ...serveur, sansPage: serveur.sansPage ?? SANS_ROUTE, enCours: false };
      const raison = lus === undefined ? undefined : raisonDe(lus, serveur);
      const dit = dits.get(serveur.worktree);
      return { ...serveur, ...(raison === undefined ? {} : { raison }), enCours: enCours.has(serveur.worktree), ...(dit === undefined ? {} : { dit }) };
    });
    const vide = lus === undefined ? PAS_LU : pages.length > 0 || aLancer.length > 0 ? undefined : illisibles.length > 0 ? ILLISIBLE : empeche.length > 0 ? EMPECHE : AUCUN;
    // Le rappel va avec un geste : sans page à ouvrir, il n'a rien à rappeler.
    const rappel = pages.some(({ route }) => route !== null) ? { rappel: RAPPEL } : {};
    return { projet: nom, pages, aLancer, illisibles, empeche, ...(vide === undefined ? rappel : { vide }), ...(refus === undefined ? {} : { refus }) };
  }

  function lacher(tenu: Tenu, worktree: string): void {
    const ouvert = tenu.ouverts.get(worktree);
    tenu.ouverts.delete(worktree);
    ouvert?.transfert.fermer();
  }

  // Le geste : le transfert, s'il n'est pas déjà tenu, puis la commande d'ouverture.
  async function mener(servi: Servi, tenu: Tenu, { worktree, port, route }: Serveur & { route: string }): Promise<void> {
    const dire = (ouverte: boolean, texte: string) => void tenu.dits.set(worktree, { ouverte, texte });
    // Tenu pour une autre box, ou un autre port : ce n'est plus celui de ce serveur.
    const tenuAvant = tenu.ouverts.get(worktree);
    if (tenuAvant !== undefined && (tenuAvant.hote !== servi.box.hote || tenuAvant.port !== port)) lacher(tenu, worktree);
    let ouvert = tenu.ouverts.get(worktree);
    if (ouvert === undefined) {
      const rendu = await options.transferer(servi, port, tenu.arret.signal);
      if ("refus" in rendu) return dire(false, rendu.refus);
      // Le temps que `ssh` s'installe, le serveur a pu quitter `status`, et le projet l'app.
      const montre = tenu.lus === undefined || tenu.lus.serveurs.some((lu) => lu.worktree === worktree && lu.port === port);
      if (ferme || tenus.get(servi.nom) !== tenu || !montre) return rendu.fermer();
      const neuf = (ouvert = { hote: servi.box.hote, port, transfert: rendu });
      tenu.ouverts.set(worktree, neuf);
      // `ssh` sorti de lui-même — la box qui ne répond plus : la page ouverte n'a plus de chemin.
      void rendu.fini.then(() => {
        if (tenu.ouverts.get(worktree) !== neuf) return;
        tenu.ouverts.delete(worktree);
        dire(false, "the port forward closed — `ssh` exited: the open page no longer answers. The action reopens it");
      });
    }
    // La page de l'écran, sur le port de ce poste : la route que `status` écrit, jamais la racine.
    const { local } = ouvert.transfert;
    const url = `http://127.0.0.1:${local}${route}`;
    const chemin = `the worktree's port ${port}, brought by \`ssh\` ${local === port ? "to the same port on this workstation" : `to port ${local} on this workstation (port ${port} is taken there)`} as long as \`status\` shows this server and the app is open`;
    try {
      await options.ouvrir(url);
      dire(true, `opened in your browser: ${url} — ${chemin}`);
    } catch (erreur) {
      dire(false, `this workstation did not open its browser (${erreur instanceof Error ? erreur.message : String(erreur)}) — the page is at ${url}: ${chemin}`);
    }
  }

  return {
    // Ce qu'une lecture de `status` montre pour un projet : les gestes à poser, ou ce qui
    // se lit à leur place. Un serveur qu'elle ne montre plus perd son transfert. Ratée, elle
    // ne prouve rien : aucun transfert n'est fermé, et aucun geste ne part tant qu'elle n'est pas refaite.
    recevoir(montree: Montree): Pages {
      const tenu = tenir(montree.projet);
      const status = "erreur" in montree ? undefined : montree.sorties.find(({ commande }) => commande === "status")?.texte;
      const lus = (tenu.lus = status === undefined ? undefined : serveursDe(status));
      if (lus !== undefined) {
        for (const [worktree, { port }] of tenu.ouverts) if (!lus.serveurs.some((lu) => lu.worktree === worktree && lu.port === port)) lacher(tenu, worktree);
        for (const worktree of tenu.dits.keys()) if (!lus.serveurs.some((lu) => lu.worktree === worktree)) tenu.dits.delete(worktree);
      }
      return poser(montree.projet);
    },

    // Le geste, pour un worktree que la dernière lecture montre. Rend les pages du projet
    // telles qu'elles en sortent — ou pourquoi rien n'est parti. Un geste en route ne se
    // double pas. Rien, pour un projet sans box.
    async ouvrir(projet: Projet, worktree: unknown): Promise<Pages | undefined> {
      if (projet.box === undefined || ferme) return undefined;
      const tenu = tenir(projet.nom);
      if (tenu.lus === undefined) return poser(projet.nom, `nothing opened: ${STATUS} has not been read — the action comes back with its read`);
      const serveur = tenu.lus.serveurs.find((lu) => lu.worktree === worktree);
      if (serveur === undefined) return poser(projet.nom, PLUS_MONTRE);
      const { route } = serveur;
      if (route === null) return poser(projet.nom, `nothing opened: ${serveur.sansPage ?? SANS_ROUTE}`);
      const raison = raisonDe(tenu.lus, serveur);
      if (raison !== undefined) return poser(projet.nom, `nothing opened: ${raison}`);
      let partie = tenu.enCours.get(serveur.worktree);
      if (partie === undefined) {
        partie = mener({ nom: projet.nom, box: projet.box }, tenu, { ...serveur, route }).finally(() => void tenu.enCours.delete(serveur.worktree));
        tenu.enCours.set(serveur.worktree, partie);
      }
      await partie;
      return poser(projet.nom);
    },

    // Le projet a quitté l'app, ou sa box : ses transferts sont fermés, ses gestes en route abandonnés.
    oublier(nom: string): void {
      const tenu = tenus.get(nom);
      if (tenu === undefined) return;
      tenus.delete(nom);
      tenu.arret.abort();
      for (const worktree of [...tenu.ouverts.keys()]) lacher(tenu, worktree);
    },

    // L'app ferme : plus aucun `ssh` ne lui survit.
    fermer(): void {
      ferme = true;
      for (const tenu of tenus.values()) {
        tenu.arret.abort();
        for (const worktree of [...tenu.ouverts.keys()]) lacher(tenu, worktree);
      }
      tenus.clear();
    },
  };
}
