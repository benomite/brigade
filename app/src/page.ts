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

// Un serveur, tel que `status` l'écrit (runtime/src/etat.ts, `decrireServeurs`) :
// `  #<ticket>  <worktree>  port <port>  <état> depuis <durée>  <branche>`.
// `worktree` : relatif au répertoire d'état de la box — un serveur par worktree, c'est lui qui le nomme.
export type Serveur = { ticket: number; worktree: string; port: number; etat: string };
// `entete` : ce que la ligne `serveurs` dit d'eux tous — absente, `status` n'en montre aucun.
// `illisibles` : les lignes sous elle qui n'ont pas cette forme, telles quelles.
// `empeche` : ce que les lignes `service` disent, mot pour mot — ce qui empêche le projet d'être servi.
export type Lus = { entete?: string; serveurs: Serveur[]; illisibles: string[]; empeche: string[] };

const SERVEUR = /^ {2}#(\d+) {2}(\S.*?) {2}port (\d+) {2}(\S+) depuis /;

// Les serveurs que cette sortie de `status` montre. Seules les lignes qui suivent
// la ligne `serveurs` en sont : un titre de ticket, plus haut, n'en fait pas un.
export function serveursDe(status: string): Lus {
  const lignes = status.split("\n");
  const lus: Lus = { serveurs: [], illisibles: [], empeche: [] };
  const tete = lignes.findIndex((ligne) => /^serveurs\s/.test(ligne));
  if (tete !== -1) lus.entete = (lignes[tete] as string).replace(/^serveurs\s+/, "");
  for (let rang = tete + 1; tete !== -1 && lignes[rang]?.startsWith("  ") === true; rang++) {
    const ligne = lignes[rang] as string;
    const [, ticket, worktree, port, etat] = SERVEUR.exec(ligne) ?? [];
    const lisible = ticket !== undefined && worktree !== undefined && port !== undefined && etat !== undefined && Number.isSafeInteger(Number(ticket)) && Number(port) >= 1 && Number(port) <= 65535;
    // Un worktree n'a qu'un serveur : une seconde ligne à son nom ne dit pas lequel ouvrir.
    if (lisible && !lus.serveurs.some((lu) => lu.worktree === worktree)) lus.serveurs.push({ ticket: Number(ticket), worktree, port: Number(port), etat });
    else lus.illisibles.push(ligne);
  }
  for (const ligne of lignes) if (/^service\s/.test(ligne)) lus.empeche.push(ligne.replace(/^service\s+/, ""));
  return lus;
}

// Ce que le dernier geste a donné pour un serveur : la page ouverte, ou pourquoi elle ne l'est pas.
export type Dit = { ouverte: boolean; texte: string };
// Un serveur que `status` montre, et son geste. `raison` : absente, le geste est
// posé ; sinon, pourquoi il ne l'est pas. `enCours` : le geste est parti, et n'a pas
// encore abouti. `dit` : ce que le dernier a donné, tant que le serveur est montré.
export type Page = Serveur & { raison?: string; enCours: boolean; dit?: Dit };
// Ce que la vue pose d'un projet, prêt à poser : elle n'y calcule rien.
// `vide` : ce qui se lit à la place des gestes quand il n'y en a aucun.
// `rappel` : où se dit le verdict — posé avec les gestes, et seulement avec eux.
// `refus` : pourquoi le geste qui vient d'être demandé n'est pas parti.
export type Pages = { projet: string; pages: Page[]; illisibles: string[]; empeche: string[]; vide?: string; rappel?: string; refus?: string };

// Le mot par lequel `status` dit qu'un port répond, et celui par lequel il dit des
// serveurs dont le runtime est mort (runtime/src/projections/service.ts, runtime/src/etat.ts).
const ECOUTE = "écoute";
const SANS_FIN = "sans fin au journal";
// Le geste de poste, tel que faits.ts l'écrit sans le projet : la vue le pose sur le sien.
const STATUS = "`ssh <hote> brigade <nom> status`";

const RAPPEL = "L'app ouvre la page dans ton navigateur : elle ne la montre pas, et ne recueille aucun avis. Ton oui ou ton non se dit sur l'issue du ticket — son numéro l'ouvre, dans l'onglet Rail.";
const PAS_LU = `aucune page à ouvrir : ${STATUS} n'a pas été lu — ce que l'app a obtenu à sa place est dessous. Ce n'est pas « aucun serveur »`;
const AUCUN = `aucune page à ouvrir : ${STATUS} ne montre aucun serveur pour ce projet. Un serveur n'est lancé que pour une livraison qui touche l'interface, depuis son worktree, sur un projet qui déclare comment il est servi`;
const EMPECHE = `aucune page à ouvrir : ${STATUS} ne montre aucun serveur, et dit ce qui empêche ce projet d'être servi :`;
const ILLISIBLE = `aucune page à ouvrir : sous sa ligne \`serveurs\`, ${STATUS} écrit ce que l'app n'a pas su lire — elle n'ouvre rien d'après une ligne qu'elle ne comprend pas :`;
const PLUS_MONTRE = `rien n'est ouvert : ${STATUS} ne montre plus ce serveur`;

// Pourquoi ce serveur n'a pas de geste — rien, s'il en a un. Un port qui ne
// répond pas encore n'ouvrirait qu'une erreur ; un serveur dont le runtime est
// mort n'a plus personne pour dire s'il répond.
function raisonDe({ entete }: Lus, { etat }: Serveur): string | undefined {
  if (entete?.includes(SANS_FIN) === true) return `pas de geste : ${STATUS} dit ces serveurs ${SANS_FIN} — leur runtime s'est arrêté sans les éteindre, et plus rien ne dit s'ils répondent`;
  if (etat !== ECOUTE) return `pas de geste : ${STATUS} dit « ${etat} », pas « ${ECOUTE} » — rien ne dit que son port répond sur la box. Le geste vient à la lecture qui le dit`;
  return undefined;
}

// Un port de ce poste amené jusqu'à celui d'un worktree, sur la box. `url` : l'adresse
// qui y mène. `local` : ce port. `fini` : `ssh` est sorti, le transfert n'est plus.
export type Transfert = { url: string; local: number; fini: Promise<void>; fermer(): void };

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
  const ABANDON = "rien n'est ouvert : le geste a été abandonné — son projet a quitté l'app, ou l'app ferme";
  if (signal?.aborted === true) return { refus: ABANDON };
  const relais = await tenirPort(port);
  if (relais === undefined) return { refus: "rien n'est ouvert : ce poste n'a donné aucun port où amener celui du worktree" };
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
      enfant.once("close", (code, arret) => resoudre(code === null ? `arrêté par ${arret}` : `code de sortie ${code}`));
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
        () => conclure({ refus: `rien n'est ouvert : \`ssh\` n'a pas ouvert le transfert en ${(reglages.delaiMs / 1000).toLocaleString("fr-FR")} s — il est arrêté\n${obtenu("arrêté par l'app")}` }),
        reglages.delaiMs,
      );
      const abandonner = () => conclure({ refus: ABANDON });
      signal?.addEventListener("abort", abandonner, { once: true });
      if (signal?.aborted === true) abandonner();
      void fin.then((dite) => conclure({ refus: `rien n'est ouvert : le transfert de port vers la box n'a pas tenu — \`ssh\` est sorti avant de l'ouvrir\n${obtenu(dite)}` }));
      // La prise répond-elle ? `ssh` ne l'ouvre qu'une fois la box jointe.
      const sonder = () => {
        if (conclu) return;
        const essai = connect(prise);
        essai.once("connect", () => {
          essai.destroy();
          conclure({
            url: `http://127.0.0.1:${local}/`,
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
    return { refus: `rien n'est ouvert : \`ssh\` n'a pas pu être lancé — ${erreur instanceof Error ? erreur.message : String(erreur)}` };
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
    const { serveurs, illisibles, empeche } = lus ?? { serveurs: [], illisibles: [], empeche: [] };
    const pages = serveurs.map((serveur): Page => {
      const raison = lus === undefined ? undefined : raisonDe(lus, serveur);
      const dit = dits.get(serveur.worktree);
      return { ...serveur, ...(raison === undefined ? {} : { raison }), enCours: enCours.has(serveur.worktree), ...(dit === undefined ? {} : { dit }) };
    });
    const vide = lus === undefined ? PAS_LU : pages.length > 0 ? undefined : illisibles.length > 0 ? ILLISIBLE : empeche.length > 0 ? EMPECHE : AUCUN;
    return { projet: nom, pages, illisibles, empeche, ...(vide === undefined ? { rappel: RAPPEL } : { vide }), ...(refus === undefined ? {} : { refus }) };
  }

  function lacher(tenu: Tenu, worktree: string): void {
    const ouvert = tenu.ouverts.get(worktree);
    tenu.ouverts.delete(worktree);
    ouvert?.transfert.fermer();
  }

  // Le geste : le transfert, s'il n'est pas déjà tenu, puis la commande d'ouverture.
  async function mener(servi: Servi, tenu: Tenu, { worktree, port }: Serveur): Promise<void> {
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
        dire(false, "le transfert de port s'est fermé — `ssh` est sorti : la page ouverte ne répond plus. Le geste le rouvre");
      });
    }
    const { url, local } = ouvert.transfert;
    const chemin = `le port ${port} du worktree, amené par \`ssh\` ${local === port ? "sur le même port de ce poste" : `sur le port ${local} de ce poste (le port ${port} y est pris)`} tant que \`status\` montre ce serveur et que l'app est ouverte`;
    try {
      await options.ouvrir(url);
      dire(true, `ouverte dans ton navigateur : ${url} — ${chemin}`);
    } catch (erreur) {
      dire(false, `ce poste n'a pas ouvert son navigateur (${erreur instanceof Error ? erreur.message : String(erreur)}) — la page est à ${url} : ${chemin}`);
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
      if (tenu.lus === undefined) return poser(projet.nom, `rien n'est ouvert : ${STATUS} n'a pas été lu — le geste revient avec sa lecture`);
      const serveur = tenu.lus.serveurs.find((lu) => lu.worktree === worktree);
      if (serveur === undefined) return poser(projet.nom, PLUS_MONTRE);
      const raison = raisonDe(tenu.lus, serveur);
      if (raison !== undefined) return poser(projet.nom, `rien n'est ouvert : ${raison}`);
      let partie = tenu.enCours.get(serveur.worktree);
      if (partie === undefined) {
        partie = mener({ nom: projet.nom, box: projet.box }, tenu, serveur).finally(() => void tenu.enCours.delete(serveur.worktree));
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
