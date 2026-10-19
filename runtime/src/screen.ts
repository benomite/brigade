// L'écran à regarder d'une livraison : ce que le chef doit ouvrir pour la
// valider, et en une phrase ce qu'il doit y voir. Il vient d'abord du cook, qui
// le déclare ; sinon il est déduit des fichiers que la livraison change ; sinon
// il n'y en a pas — la livraison ne touche aucun écran.
//
// ── La déclaration du cook, dans le corps de sa PR ──
//
// Le corps de la PR porte le livrable du cook (`station.ts`) : c'est là qu'il
// déclare, par deux lignes, chacune seule sur sa ligne et hors de tout bloc de
// code :
//
//     Écran : <l'écran ou la route changé>
//     À regarder : <une phrase : ce qu'il faut y regarder>
//
// Par exemple :
//
//     Écran : /rail
//     À regarder : #591 : le rail a maintenant deux colonnes, TODO et WAITING
//
// - La clé se lit sans égard à la casse ni aux accents (`Ecran`, `A regarder`),
//   en gras ou non (`**Écran** :`, `**Écran :**`), derrière une puce de liste ou non (`- `).
// - La valeur est ce qui suit les premiers deux-points, telle quelle : une
//   phrase en porte d'autres. Des backticks qui l'entourent toute entière
//   tombent (`` Écran : `/rail` `` déclare `/rail`).
// - Seul `Écran` fait une déclaration ; `À regarder` est sa phrase, et peut
//   manquer. Une phrase sans écran ne déclare rien : l'écran est alors déduit,
//   et la phrase du cook lui reste.
// - `Écran : aucun` déclare que la livraison ne touche aucun écran : rien
//   n'est déduit derrière.
// - Écrite deux fois, la dernière ligne l'emporte. Une ligne citée — dans un
//   bloc de code, ou commençant par un backtick — n'est pas une déclaration :
//   un cook qui recopie le format ne déclare rien.
//
// ── La déduction, depuis les fichiers changés ──
//
// Le dépôt du projet déclare quels fichiers sont quel écran, à côté de son
// setup de worktree, dans `.claude/brigade/ecrans` : une ligne
// « <chemin> : <écran ou route> » par écran. Un chemin possède le fichier qu'il
// nomme et tout ce qui est dessous (`zones.ts`). Chaque fichier changé est à
// l'écran du chemin le plus précis qui le possède ; l'écran déduit est celui qui
// en compte le plus, et à égalité le premier déclaré. Une déduction n'a pas de
// phrase à elle.
//
// ── La page de l'écran, pour un projet web ──
//
// Un projet web se regarde dans un navigateur, sur le serveur du worktree de
// la livraison (`servir.ts`) : la page à ouvrir est ce serveur, sur son port,
// suivi de la route de l'écran — jamais la racine du site, qu'un serveur de
// fichiers rend en liste de dossier. Un écran n'a de route que s'il en est
// une : il commence par une seule barre (`/rail`, `/projets/12?onglet=notes`,
// `/#/rail`). Un nom d'écran (`la carte`), une adresse complète, ou la racine
// seule (`/`) n'en sont pas : sans route, pas de page — rien n'est deviné.
//
// ── Comment voir l'écran, pour une app qui ne s'ouvre pas dans un navigateur ──
//
// Un projet qui déclare son `lancement` (`service.ts`) — une app Electron,
// comme `brigade` — n'a aucune page à ouvrir : un serveur de fichiers n'y
// montrerait qu'une liste de dossier. Sa livraison n'a donc jamais d'URL ; elle
// dit comment la voir, en une phrase : la commande qui lance l'app sur le
// worktree de la livraison, et l'écran à y ouvrir. Sans écran, rien à dire —
// comme une page sans route.
//
// Ce module ne lance rien et n'écrit rien : il lit le corps d'une PR, une
// liste de fichiers et la déclaration du dépôt.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { possede, refusEn } from "./zones.ts";

// Ce que le dépôt du projet déclare : quels fichiers sont quel écran.
export const SCREENS_DECLARATION = ".claude/brigade/ecrans";

// L'écran à regarder. `ecran` : un écran ou une route, tel que déclaré.
// `phrase` : ce qu'il faut y regarder ; nulle, personne ne l'a dit.
// `source` : `declare` par le cook dans sa PR, `deduit` des fichiers changés.
export type ScreenToLookAt = { ecran: string; phrase: string | null; source: "declare" | "deduit" };

// Ce que le corps d'une PR déclare. `ecran` nul : aucune déclaration ;
// `aucun` : le cook déclare qu'aucun écran n'est touché.
export type Declaration = { ecran: string | null; aucun: boolean; phrase: string | null };

// Une ligne de `.claude/brigade/ecrans`.
export type Correspondance = { chemin: string; ecran: string };

export type Screens = {
  correspondances: Correspondance[];
  // Ce qui n'a pas été compris. Une ligne mal écrite est écartée, les autres
  // restent lues.
  problemes: string[];
};

const sansAccents = (texte: string) => texte.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// Une ligne de déclaration : puce facultative, clé en gras ou non, deux-points.
const LIGNE = /^(?:[-*+]\s+)?(?:\*\*|__)?([\p{L} ]+?)(?:\*\*|__)?\s*:(?:\*\*|__)?(.*)$/u;
const CLES = { ecran: "ecran", phrase: "a regarder" } as const;
const AUCUN = "aucun";

// Ce qui est dans un bloc de code clôturé ne se lit pas.
const horsDesBlocs = (texte: string): string[] => {
  const lignes: string[] = [];
  let dansUnBloc = false;
  for (const ligne of texte.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(ligne)) dansUnBloc = !dansUnBloc;
    else if (!dansUnBloc) lignes.push(ligne);
  }
  return lignes;
};

const valeurDe = (brute: string): string | null => {
  const valeur = brute.trim().replace(/^`([^`]+)`$/, "$1").trim();
  return valeur === "" ? null : valeur;
};

// Lit la déclaration du cook dans le corps de sa PR. Sans E/S.
export function lireDeclaration(corps: string | null): Declaration {
  let screen: string | null = null;
  let phrase: string | null = null;
  for (const ligne of horsDesBlocs(corps ?? "")) {
    const [, cle, suite] = LIGNE.exec(ligne.trim()) ?? [];
    if (cle === undefined) continue;
    const valeur = valeurDe(suite ?? "");
    if (valeur === null) continue;
    const lue = sansAccents(cle.trim());
    if (lue === CLES.ecran) screen = valeur;
    else if (lue === CLES.phrase) phrase = valeur;
  }
  const aucun = screen !== null && sansAccents(screen) === AUCUN;
  return { ecran: aucun ? null : screen, aucun, phrase };
}

const profondeur = (chemin: string) => chemin.split("/").filter((segment) => segment !== "" && segment !== ".").length;

// Lit la déclaration des écrans du dépôt, sans E/S. Tout ce qu'elle dit mal
// devient un problème dit, et la ligne est écartée : jamais un écran deviné.
export function readScreens(texte: string): Screens {
  const screens: Screens = { correspondances: [], problemes: [] };
  texte.split(/\r?\n/).forEach((brute, rang) => {
    const ligne = brute.trim();
    if (ligne === "" || ligne.startsWith("#")) return;
    const probleme = (pourquoi: string) => void screens.problemes.push(`line ${rang + 1} of \`${SCREENS_DECLARATION}\` ("${ligne.slice(0, 80)}"): ${pourquoi}`);
    const deuxPoints = ligne.indexOf(":");
    if (deuxPoints < 0) return probleme("not a \"<path>: <screen or route>\" line");
    const chemin = ligne.slice(0, deuxPoints).trim().replace(/\/+$/, "");
    const screen = ligne.slice(deuxPoints + 1).trim();
    if (chemin === "") return probleme("the path is missing");
    const defaut = refusEn(chemin);
    if (defaut !== null) return probleme(`"${chemin}" ${defaut}`);
    // `.` posséderait tout : une livraison de documentation aurait un écran.
    if (profondeur(chemin) === 0) return probleme(`"${chemin}" names no path — the whole repository is not a screen`);
    if (screen === "") return probleme(`the screen of "${chemin}" is missing`);
    const deja = screens.correspondances.find((lue) => lue.chemin === chemin);
    if (deja) return probleme(`"${chemin}" is already the screen "${deja.ecran}" — a path is only one screen`);
    screens.correspondances.push({ chemin, ecran: screen });
  });
  return screens;
}

// La déclaration des écrans d'un worktree. Absente : aucun écran ne se déduit.
// Ne lève pas : ce qui ne se lit pas est dit.
export function worktreeScreens(worktree: string): Screens {
  try {
    return readScreens(readFileSync(join(worktree, SCREENS_DECLARATION), "utf8"));
  } catch (erreur) {
    const { code, message } = erreur as NodeJS.ErrnoException;
    if (code === "ENOENT" || code === "ENOTDIR") return { correspondances: [], problemes: [] };
    return { correspondances: [], problemes: [`\`${SCREENS_DECLARATION}\` is unreadable — ${code ?? message}`] };
  }
}

// L'écran que les fichiers changés touchent le plus, ou null.
export function deduceScreen(changes: string[], correspondances: Correspondance[]): string | null {
  const comptes = new Map<string, number>();
  for (const fichier of changes) {
    const sien = correspondances.filter((lue) => possede(lue.chemin, fichier)).reduce<Correspondance | null>((plus, lue) => (plus === null || profondeur(lue.chemin) > profondeur(plus.chemin) ? lue : plus), null);
    if (sien) comptes.set(sien.ecran, (comptes.get(sien.ecran) ?? 0) + 1);
  }
  // L'ordre de déclaration départage : le premier déclaré l'emporte à égalité.
  let retenu: string | null = null;
  for (const { ecran: screen } of correspondances) {
    if ((comptes.get(screen) ?? 0) > (retenu === null ? 0 : (comptes.get(retenu) ?? 0))) retenu = screen;
  }
  return retenu;
}

// L'écran à regarder d'une livraison : déclaré dans sa PR, sinon déduit des
// fichiers qu'elle change, sinon null. Sans E/S.
export function screenToLookAt(delivery: { corps: string | null; changes: string[]; correspondances: Correspondance[] }): ScreenToLookAt | null {
  const declaration = lireDeclaration(delivery.corps);
  if (declaration.aucun) return null;
  if (declaration.ecran !== null) return { ecran: declaration.ecran, phrase: declaration.phrase, source: "declare" };
  const deduit = deduceScreen(delivery.changes, delivery.correspondances);
  return deduit === null ? null : { ecran: deduit, phrase: declaration.phrase, source: "deduit" };
}

// La même, lue dans le worktree de la livraison : `corps` est celui de sa PR,
// `changes` ses fichiers changés (`depot.changes`). `problemes` : ce que la
// déclaration des écrans du dépôt dit mal, à dire au chef — l'écran est lu
// sans les lignes écartées.
export function deliveryScreen(delivery: { worktree: string; corps: string | null; changes: string[] }): { ecran: ScreenToLookAt | null; problemes: string[] } {
  const { correspondances, problemes } = worktreeScreens(delivery.worktree);
  return { ecran: screenToLookAt({ corps: delivery.corps, changes: delivery.changes, correspondances }), problemes };
}

// L'hôte du serveur d'un worktree : il n'écoute que sur la boucle locale.
export const SERVER_HOST = "127.0.0.1";

// Une origine qui ne sert qu'à lire une route : une route qui en changerait
// (`//ailleurs`) n'en est pas une.
const LECTURE = "http://ecran.invalid";

// La route d'un écran, telle qu'un navigateur l'ouvrirait, ou null : l'écran
// n'est pas une route, ou n'est que la racine. Sans E/S.
export function screenRoute(screen: string): string | null {
  const brute = screen.trim();
  // Une barre inverse vaut une barre pour un navigateur : `/\ailleurs` change d'hôte.
  if (!brute.startsWith("/") || brute.startsWith("//") || /[\s\\\p{Cc}]/u.test(brute)) return null;
  let lue: URL;
  try {
    lue = new URL(brute, LECTURE);
  } catch {
    return null;
  }
  if (lue.origin !== LECTURE) return null;
  const route = `${lue.pathname}${lue.search}${lue.hash}`;
  return route === "/" ? null : route;
}

// La page à ouvrir pour regarder une livraison d'un projet web : le serveur de
// son worktree, sur `port`, suivi de la route de son écran. Null : la
// livraison n'a pas d'écran, ou son écran n'a pas de route. Sans E/S.
export function screenPage(port: number, screen: ScreenToLookAt | null): string | null {
  const route = screen === null ? null : screenRoute(screen.ecran);
  return route === null ? null : `http://${SERVER_HOST}:${port}${route}`;
}

// Un chemin tel qu'un shell le lit, sans rien y interpréter.
const citer = (chemin: string) => `'${chemin.replaceAll("'", `'\\''`)}'`;

// La commande qui lance l'app sur le worktree d'une livraison : on s'y place,
// puis on lance ce que le projet déclare. Sans E/S.
export function commandeDeLancement(worktree: string, lancement: string): string {
  return `cd ${citer(worktree)} && ${lancement.trim()}`;
}

// Comment voir l'écran d'une livraison d'une app qui ne s'ouvre pas dans un
// navigateur : la commande qui la lance sur son worktree, l'écran à y ouvrir,
// et ce qu'il faut y regarder s'il est dit. Null : la livraison n'a pas
// d'écran. Sans E/S.
export function commentLeVoir(delivery: { worktree: string; lancement: string; ecran: ScreenToLookAt | null }): string | null {
  const { ecran: screen } = delivery;
  if (screen === null) return null;
  const regarder = screen.phrase === null ? "" : ` — à regarder : ${screen.phrase}`;
  return `pas de page dans un navigateur : lancer l'app sur le worktree de la livraison, \`${commandeDeLancement(delivery.worktree, delivery.lancement)}\`, puis y ouvrir l'écran « ${screen.ecran} »${regarder}`;
}

// La même phrase, en anglais, depuis la commande de lancement déjà composée
// (`commandeDeLancement`) : ce que dit `status`.
export function commentLeVoirEn(commande: string, screen: ScreenToLookAt): string {
  const regarder = screen.phrase === null ? "" : ` — to look at: ${screen.phrase}`;
  return `no page in a browser: launch the app on the delivery's worktree, \`${commande}\`, then open the screen “${screen.ecran}” there${regarder}`;
}

// Comment se regarde une livraison, selon son projet. `page` : l'URL à ouvrir
// dans un navigateur, pour un projet web — nulle pour une app lancée, jamais
// une URL. `commentLeVoir` : la phrase qui dit comment la voir, pour une app
// lancée — nulle pour un projet web, que sa page suffit à montrer. Les deux
// nuls : la livraison n'a pas d'écran, ou son écran n'a pas de route. Sans E/S.
export type Regard = { page: string | null; commentLeVoir: string | null };

export function deliveryLook(
  projet: { regard: "navigateur"; port: number } | { regard: "lancement"; lancement: string; worktree: string },
  screen: ScreenToLookAt | null,
): Regard {
  if (projet.regard === "navigateur") return { page: screenPage(projet.port, screen), commentLeVoir: null };
  return { page: null, commentLeVoir: commentLeVoir({ worktree: projet.worktree, lancement: projet.lancement, ecran: screen }) };
}
