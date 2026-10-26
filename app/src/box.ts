// La veille des box : ce que l'app sait d'un projet, elle l'a lu en lançant
// à la place du chef les commandes qui existent, par `ssh` — ou ici, sans `ssh`, quand
// c'est la station de cet ordinateur qui fait tourner sa cuisine. Elle rend leur
// sortie mot pour mot — rien n'y est cherché, découpé ni redit — et n'ajoute
// que deux faits, les siens : l'heure de la lecture et, quand elle a échoué,
// si c'est la box qui n'a pas été atteinte ou la commande qui n'a pas répondu.
// Elle rend alors ce qu'elle a obtenu, à la place de l'état : rien n'est gardé
// de la lecture d'avant.
import { execFile, type ExecFileException } from "node:child_process";
import { join } from "node:path";
import { setTimeout as attendre } from "node:timers/promises";
import type { Box, Projet } from "./config.ts";
import { nombre } from "./format.ts";

export type Sortie = { commande: string; texte: string };
// Une commande à lancer : son texte, ou ce qui le compose d'après les sorties lues avant elle
// dans la même lecture — `measures` sur la fenêtre que `station` vient de dire (fiabilite.ts).
export type Commande = string | ((lues: readonly Sortie[]) => string);
// `atteinte` : `ssh` a joint la box, et c'est la commande qui a échoué, ou qui
// n'a rien rendu. Fausse : rien ne le prouve — c'est `ssh` lui-même qui a échoué
// (code 255), qui n'a pas pu être lancé, ou qu'il a fallu arrêter sans qu'il ait
// dit jusqu'où il était allé.
// `cas` : ce que le code de sortie prouve à lui seul, quand il prouve quelque
// chose — jamais ce que le texte dit. Ce qui a été écrit est dans `erreur`, comme le reste.
//   `ssh-en-echec`    `ssh` a rendu son propre code (255) : il n'a pas ouvert de session, et il a dit pourquoi
//   `projet-inconnu`  le geste a refusé le projet : la box ne le connaît pas sous ce nom
//   `sans-droit`      le geste a refusé celui qui le lance : son compte n'en a pas le droit
//   `commande-manque` une commande manque à la box — le geste lui-même, ou `sudo`
//   `node-inapte`     le geste a refusé de lancer le runtime : le `node` de la box ne démarre pas, ou n'est pas la version réclamée
export type Cas = "ssh-en-echec" | "projet-inconnu" | "sans-droit" | "commande-manque" | "node-inapte";
// `duTableau` : ce n'est ni `ssh` ni la station d'ici qui a échoué, mais la lecture du tableau de la cuisine du projet
// sur GitHub (tableau/rail.ts, #1694) — `erreur` est alors sa raison, en une phrase.
export type Echec = { erreur: string; atteinte: boolean; cas: Cas | null; duTableau?: true };
// `demande` : celle à laquelle la lecture répond, telle que `regarder` l'a reçue.
// `a` : l'instant où la lecture a fini. Une lecture a des sorties, ou une
// erreur — jamais les deux.
export type Lecture = { projet: string; demande: number; a: string } & ({ sorties: Sortie[] } | Echec);

// Un projet qui a une box : son nom est celui que le geste reçoit.
export type Servi = { nom: string; box: Box };

// La station de cet ordinateur, telle que son geste s'y lance sans `ssh` : le `node` qui le joue,
// le dossier du runtime et le répertoire de la station (`BRIGADE_STATION_DIR`) — ceux avec
// lesquels l'app la lance (poste/station.ts).
export type Locale = { node: string; runtime: string; racine: string; env: Record<string, string | undefined> };
// Où se lit la cuisine d'un projet : sa box, jointe par `ssh`, ou la station de cet ordinateur.
export type Cuisine = Box | { locale: Locale };
// Un projet tel qu'il se lit : son nom, et là où sa cuisine tourne à cet instant.
export type Lu = { nom: string; cuisine: Cuisine };

// Ce qui règle un `ssh` : son binaire, le délai passé lequel il est arrêté, et ce
// qu'il s'accorde pour joindre la box, en secondes.
export type Reglages = { ssh: string; delaiMs: number; connexionS: number };
// Ce que `ssh` a rendu d'une commande du geste, brut. `lance` : la ligne lancée, telle qu'elle se relit.
export type Rendu = { lance: string; erreur: ExecFileException | null; sortie: string; erreurs: string };

export type Veille = ReturnType<typeof ouvrirVeille>;

// Les codes qui disent un cas. 255 est à `ssh` ; 65, 68, 69 et 70 sont des refus du
// geste (docs/runtime/exploitation.md, « Piloter ») ; 127 est celui du shell de la box, qui
// n'a pas trouvé la commande.
const CAS: Readonly<Record<number, Cas>> = { 255: "ssh-en-echec", 65: "projet-inconnu", 68: "sans-droit", 69: "commande-manque", 70: "node-inapte", 127: "commande-manque" };

// Le nom tel que le shell de la box le rendra au geste : en un seul argument,
// sans rien en exécuter. Un nom que le geste accepte part tel quel.
export const cite = (nom: string) => (/^[a-z0-9-]+$/.test(nom) ? nom : `'${nom.replaceAll("'", `'\\''`)}'`);

// Une commande du geste, lancée une fois sur la box d'un projet. Jamais d'exception :
// ce qui arrive est rendu, et c'est à qui l'a lancée de dire ce que ça prouve.
export function lancerGeste(reglages: Reglages, { nom, box }: Servi, commande: string, signal?: AbortSignal): Promise<Rendu> {
  // Sans terminal, `ssh` ne peut rien demander : il échoue plutôt que d'attendre un mot de passe.
  const args = ["-o", "BatchMode=yes", "-o", `ConnectTimeout=${reglages.connexionS}`, "--", box.hote, `brigade ${cite(nom)} ${commande}`];
  return new Promise((resoudre) => {
    execFile(reglages.ssh, args, { windowsHide: true, signal, timeout: reglages.delaiMs, maxBuffer: 16 * 1024 * 1024 }, (erreur, sortie, erreurs) => resoudre({ lance: `$ ${reglages.ssh} ${args.join(" ")}`, erreur, sortie, erreurs }));
  });
}

// Le point d'entrée du geste d'une station, dans le dossier du runtime : celui que `brigade`
// lance sur une box (runtime/src/station/geste.ts).
export const GESTE = join("src", "station", "geste.ts");

// Les mots d'une commande, tels qu'un shell les donnerait au geste : séparés par des blancs, un
// passage entre apostrophes reste entier — la forme que `cite` écrit.
export function mots(commande: string): string[] {
  const rendus: string[] = [];
  let mot: string | undefined;
  for (let rang = 0; rang < commande.length; rang++) {
    const lettre = commande[rang] as string;
    if (/\s/.test(lettre)) {
      if (mot !== undefined) rendus.push(mot);
      mot = undefined;
    } else if (lettre === "'") {
      const fin = commande.indexOf("'", rang + 1);
      const jusqua = fin === -1 ? commande.length : fin;
      mot = (mot ?? "") + commande.slice(rang + 1, jusqua);
      rang = jusqua;
    } else if (lettre === "\\" && rang + 1 < commande.length) {
      mot = (mot ?? "") + commande[++rang];
    } else mot = (mot ?? "") + lettre;
  }
  if (mot !== undefined) rendus.push(mot);
  return rendus;
}

// Une commande du geste, lancée une fois par la station de cet ordinateur, sans `ssh` : son
// geste, dans le dossier du runtime, avec le répertoire de la station — ce que `brigade <nom>
// <commande>` lance sur une box. Jamais d'exception, comme `lancerGeste`.
export function lancerIci(locale: Locale, nom: string, commande: string, delaiMs: number, signal?: AbortSignal): Promise<Rendu> {
  const args = [join(locale.runtime, GESTE), nom, ...mots(commande)];
  return new Promise((resoudre) => {
    execFile(locale.node, args, { windowsHide: true, cwd: locale.runtime, env: { ...locale.env, BRIGADE_STATION_DIR: locale.racine }, signal, timeout: delaiMs, maxBuffer: 16 * 1024 * 1024 }, (erreur, sortie, erreurs) =>
      resoudre({ lance: `$ ${locale.node} ${args.join(" ")}`, erreur, sortie, erreurs }),
    );
  });
}

// Ce qu'une commande lancée ici, sans `ssh`, prouve en échouant. La station est sur cet
// ordinateur : elle est atteinte, sauf quand son `node` n'a pas pu être lancé. Son code dit le
// cas du geste, comme sur une box — 255 n'y est celui d'aucun `ssh`.
export function echecIci({ lance, erreur, sortie, erreurs }: Rendu & { erreur: ExecFileException }, delaiMs: number): Echec {
  const suite = erreur.killed === true ? `no answer within ${nombre(delaiMs / 1000)} s: the command was stopped` : typeof erreur.code === "number" ? `exit code ${erreur.code}` : erreur.message;
  const code = erreur.killed !== true && typeof erreur.code === "number" ? erreur.code : undefined;
  return {
    erreur: `${lance}\n${erreurs}${sortie}\n→ ${suite}`,
    atteinte: erreur.killed === true || typeof erreur.code === "number" || erreur.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
    cas: (code !== undefined && code !== 255 && CAS[code]) || null,
  };
}

// Une commande du geste, lancée une fois là où la cuisine du projet tourne : sur sa box par `ssh`,
// ou ici, par la station de cet ordinateur, sans `ssh`. Jamais d'exception, comme les deux.
export function lancerLa(reglages: Reglages, { nom, cuisine }: Lu, commande: string, signal?: AbortSignal): Promise<Rendu> {
  return "locale" in cuisine ? lancerIci(cuisine.locale, nom, commande, reglages.delaiMs, signal) : lancerGeste(reglages, { nom, box: cuisine }, commande, signal);
}

// Ce qu'une commande lancée là prouve en échouant : ce qu'en dit `ssh`, ou la station d'ici.
export function echecLa(cuisine: Cuisine, rendu: Rendu & { erreur: ExecFileException }, delaiMs: number): Echec {
  return "locale" in cuisine ? echecIci(rendu, delaiMs) : echecDe(rendu, delaiMs);
}

// Ce qu'un `ssh` en échec prouve, et ce qu'il a rendu.
export function echecDe({ lance, erreur, sortie, erreurs }: Rendu & { erreur: ExecFileException }, delaiMs: number): Echec {
  // Arrêté par le délai, un `ssh` connecté attrape le signal et sort de lui-même en 255.
  // Avant la session — un agent qui attend une confirmation — il en meurt, sans code :
  // rien ne dit alors s'il avait joint la box. Un autre arrêt se dit lui-même.
  const connecte = erreur.code === 255;
  const suite =
    erreur.killed === true
      ? `no answer within ${nombre(delaiMs / 1000)} s: ssh stopped${connecte ? "" : ", without saying whether it had reached the station"}`
      : typeof erreur.code === "number"
        ? `exit code ${erreur.code}`
        : erreur.message;
  return {
    erreur: `${lance}\n${erreurs}${sortie}\n→ ${suite}`,
    // 255 est le code de `ssh` : celui d'une box pas jointe, sauf quand c'est le délai qui
    // l'a fait sortir. Tout autre code vient de la box — et une sortie trop longue aussi.
    atteinte: connecte ? erreur.killed === true : typeof erreur.code === "number" || erreur.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
    // Arrêté, `ssh` n'a rien dit de lui-même : son code est celui du délai.
    cas: (erreur.killed !== true && typeof erreur.code === "number" && CAS[erreur.code]) || null,
  };
}

export function ouvrirVeille(options: {
  ssh: string;
  // Entre la fin d'une lecture et le début de la suivante.
  intervalleMs: number;
  // Passé ce délai, un `ssh` qui n'a pas fini est arrêté.
  delaiMs: number;
  // Ce que `ssh` s'accorde pour joindre la box, en secondes — moins que le
  // délai : une box muette, c'est lui qui le dit, avec ses mots et son code.
  // Ce temps ne couvre pas tout ce qui précède la session : un `ssh` encore là
  // au délai n'avait pas forcément joint la sienne.
  connexionS: number;
  // Le passage de chaque projet : la dernière commande partie pour lui. Plusieurs
  // veilles qui se le partagent n'ouvrent, à elles toutes, qu'une connexion à la
  // fois par projet. Absent, la veille a le sien.
  passage?: Map<string, Promise<unknown>>;
  // Où la cuisine d'un projet tourne, demandé à chaque lecture : un projet dont la cuisine passe
  // de sa box à cet ordinateur, ou l'inverse, est lu à sa nouvelle place dès la lecture suivante.
  // Absent, c'est sa box. Rien : rien n'est lu de lui, cette fois.
  cuisine?: (projet: Projet) => Cuisine | undefined;
  surLecture(lecture: Lecture): void;
}) {
  let tour: AbortController | undefined;
  const passage = options.passage ?? new Map<string, Promise<unknown>>();
  const cuisineDe = options.cuisine ?? (({ box }: Projet) => box);

  // Chacune attend que la précédente du même projet ait fini, de quelque veille qu'elle soit.
  function lancer(lu: Lu, commande: string, signal: AbortSignal): Promise<Sortie | Echec> {
    const rendu = (passage.get(lu.nom) ?? Promise.resolve()).then(() => joindre(lu, commande, signal));
    passage.set(lu.nom, rendu);
    return rendu;
  }

  async function joindre(lu: Lu, commande: string, signal: AbortSignal): Promise<Sortie | Echec> {
    const rendu = await lancerLa(options, lu, commande, signal);
    const { erreur } = rendu;
    if (erreur === null) return { commande, texte: rendu.sortie };
    return echecLa(lu.cuisine, { ...rendu, erreur }, options.delaiMs);
  }

  // Les commandes partent l'une après l'autre, et la première qui échoue est
  // l'erreur : un projet n'ouvre qu'une connexion à la fois, pour que tous les
  // projets d'une même box, lus de front, n'y soient pas refusés pour leur nombre.
  async function lire(lu: Lu, commandes: readonly Commande[], signal: AbortSignal): Promise<{ sorties: Sortie[] } | Echec> {
    const sorties: Sortie[] = [];
    for (const voulue of commandes) {
      const rendu = await lancer(lu, typeof voulue === "string" ? voulue : voulue(sorties), signal);
      if ("erreur" in rendu) return rendu;
      sorties.push(rendu);
    }
    return { sorties };
  }

  // Un projet : lu tout de suite, puis à chaque intervalle, sans rien attendre des autres — là où
  // sa cuisine tourne au moment de chaque lecture.
  async function suivre(projet: Projet, commandes: readonly Commande[], demande: number, signal: AbortSignal): Promise<void> {
    for (;;) {
      const cuisine = cuisineDe(projet);
      if (cuisine !== undefined) {
        const lue = await lire({ nom: projet.nom, cuisine }, commandes, signal);
        // Le chef regarde ailleurs, ou l'app ferme : cette lecture n'est plus à personne.
        if (signal.aborted) return;
        options.surLecture({ projet: projet.nom, demande, a: new Date().toISOString(), ...lue });
      }
      await attendre(options.intervalleMs, undefined, { signal }).catch(() => {});
      if (signal.aborted) return;
    }
  }

  function arreter(): void {
    tour?.abort();
  }

  return {
    // Ce qui est affiché — un projet, ou chacun dans « Tous les projets » — et les commandes
    // à y lancer, dans l'ordre où la vue les montre. Rien d'autre n'est lu ; un
    // projet dont la cuisine n'est nulle part — sans box, et pas sur cet ordinateur — ne
    // l'est pas, tant qu'elle n'y est pas. Chaque lecture porte la `demande` : celle
    // d'un écran quitté peut encore être en route quand la vue en montre un autre.
    regarder(projets: readonly Projet[], commandes: readonly Commande[], demande: number): void {
      arreter();
      const { signal } = (tour = new AbortController());
      for (const projet of projets) void suivre(projet, commandes, demande, signal);
    },

    fermer: arreter,
  };
}
