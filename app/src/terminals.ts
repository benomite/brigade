// Le registre des terminaux : un second par projet, et les shells ouverts à
// côté. Il vit dans le process principal — aucune vue ne tient un pty : changer
// d'espace, ou d'onglet, ne peut donc rien interrompre.
//
// Un shell que le chef ouvre par « + shell » est persistant (persistence.ts) : il vit dans une
// session, sur la machine choisie (machines.ts), et l'app s'en souvient (memories.ts). Fermer
// l'app ne fait que s'en détacher : à la réouverture, il revient dans l'espace de son projet,
// rattaché à sa session. Seule sa fermeture par le chef la détruit. Le shell qu'un geste ouvre
// pour y écrire sa commande, lui, est un shell de ce poste qui finit avec l'app — comme, sous
// Windows, celui que « + shell » ouvre sur ce poste : il n'y a pas de session où le tenir.
import { accountOf, textBanner } from "./banner.ts";
import type { Project } from "./config.ts";
import { HERE, WITHOUT_SESSION } from "./platform.ts";
import { destroy as destroySession, nameOfSession, attachment, type Target, type Session } from "./persistence.ts";
import { hooksOfTurns, SAYS, PROOF, settingsFile, followInput, type Input, type Turns } from "./input.ts";
import { hooksOfTheFile } from "./second/hook-of-the-file.ts";
import { hooksOfRole } from "./second/hook-of-role.ts";
import { hooksOfParking } from "./second/hook-of-parking.ts";
import { hooksOfRefusal } from "./second/refusal.ts";
import { argumentsOfSecond, settingsOfSecond, type Hooks } from "./second/launch.ts";
import type { Reminder, Memory, Memories } from "./memories.ts";
import type { OutilVu } from "../../runtime/src/second/outils.ts";
import type { PlanDuSecond } from "../../runtime/src/second/lancement.ts";

export type Pty = {
  ecrire(data: string): void;
  redimensionner(columns: number, lines: number): void;
  tuer(): void;
};

export type Launch = {
  commande: string;
  args: string[];
  dossier: string;
  colonnes: number;
  lignes: number;
  surSortie(data: string): void;
  surFin(code: number): void;
  // Ce que le plan du second y ajoute (runtime/src/second/lancement.ts, #1433) : `verbatim`, les `args` sont une
  // ligne déjà écrite pour Windows, que rien ne doit plus citer ; `env`, ce qui s'ajoute à l'environnement du chef.
  verbatim?: boolean;
  env?: Record<string, string>;
};

// Un outil qui manque au second (runtime/src/second/outils.ts, #1433) : son nom, pourquoi le second en a besoin, la
// phrase qui dit comment l'obtenir sur ce poste, et la page qui l'explique.
export type ToolMissing = { tool: string; reason: string; install: string; link: string };
// Ce que le plan du second dit de lui, en une phrase, et chaque outil qui manque (#1435).
export type SaysOfSecond = { reason: string; tools: ToolMissing[] };

// Ce que la vue montre d'un terminal. `note` est ce que l'app en dit — c'est là
// que se lit « fil repris » ou « session neuve ».
export type Terminal = {
  id: number;
  projet: string;
  genre: "second" | "shell";
  titre: string;
  note: string;
  arrete: boolean;
  // Où l'on est et avec quel compte — « box parade-box · debian » — pour un shell persistant.
  bandeau?: string;
  // La note est celle d'une demande écrite dans ce second, que l'Entrée du chef n'a pas encore
  // envoyée : elle disparaît à l'Entrée. Absent, rien n'y est écrit — la note dit pourquoi.
  demandeEcrite?: true;
  // Rien n'est parti dans le second, et le geste n'a pas eu lieu : la vue le dit au chef, avec de quoi réessayer.
  nonParti?: true;
  // Le second ne part pas (#1435) : pourquoi, et les outils qui manquent — la vue le dit à la place du terminal.
  empeche?: SaysOfSecond;
  // Il part, mais des outils lui manquent : ce qui en a besoin échouera tant qu'ils ne sont pas installés.
  manque?: SaysOfSecond;
  // La fenêtre s'est rechargée (#3159) et ce second ne tournait plus : il n'a pas pu être rattaché. Sa note le dit, et la
  // vue pose à côté de quoi le reprendre — comme une touche, qui le relance.
  aReprendre?: true;
};

// Un terminal tel qu'une vue rechargée le retrouve (#3159) : ce qu'elle en montre, et ce qu'il a écrit — la fin seulement.
export type Open = { terminal: Terminal; ecrit: string };

// Ce que l'app garde de ce qu'un terminal a écrit, pour une vue qui se recharge : le dernier million de caractères. Au
// double, la tête s'en va.
export const HELD = 1_000_000;

export type Terminals = ReturnType<typeof openTerminals>;

// Les outils que le plan dit absents, avec ce qui les obtient — rien d'autre de ce qu'il a vu.
const missing = (tools: readonly OutilVu[]): ToolMissing[] =>
  tools.flatMap((seenOne) => (seenOne.present ? [] : [{ tool: seenOne.tool, reason: seenOne.reason, install: seenOne.install, link: seenOne.link }]));

// `saisie` : ce que l'app sait de la saisie d'un second qui tourne (input.ts).
// `persistant` : la session d'un shell persistant, et son rang dans le projet.
// `lances` : le numéro du dernier lancement — la fin d'un pty que l'app a remplacé ne dit plus rien.
// `ici` : le bandeau d'un shell persistant tel qu'il est quand sa machine répond.
// `ici` : le bandeau d'un shell persistant.
type Tenu = Terminal & {
  dossier: string;
  // Le projet tel que la file se lit : son nom, et son dépôt GitHub quand le fichier des projets le donne.
  cible: { nom: string; depot?: string; base?: string };
  colonnes: number;
  lignes: number;
  lances: number;
  pty?: Pty;
  saisie?: Input;
  persistant?: { rang: number; session: Session };
  ici?: string;
  // Ce qu'il a écrit depuis son ouverture, relancements compris — comme le terminal de la vue, qui le garde aussi.
  ecrit: string;
};

// Ce qui ne s'écrit jamais dans un terminal à la place du chef : un retour à la
// ligne enverrait la commande, et tout autre caractère de contrôle y est une touche.
// Qui prépare une commande (actions.ts) la refuse par la même règle, avant d'ouvrir un shell.
export const CONTROL = /[\x00-\x1f\x7f]/;
export const WITHOUT_WRITE = "nothing is written: the command carries a control character, and a line break would have sent it — check “nom” of this project in the projects file";

// Ce qu'une vue rechargée rejoue : la fin de ce qui a été écrit, à partir d'un début de ligne quand elle a été coupée —
// une séquence d'échappement tranchée en deux n'y laisse pas sa moitié.
function sinceOneLine(written: string): string {
  if (written.length <= HELD) return written;
  const end = written.slice(-HELD);
  const line = end.indexOf("\n");
  return line === -1 ? end : end.slice(line + 1);
}

export function openTerminals(options: {
  ouvrirPty(launching: Launch): Pty;
  claude: string;
  // Le shell de ce poste, et ses arguments — `-l` par défaut : un shell de connexion (platform.ts).
  shell: string;
  argsDuShell?: readonly string[];
  // Un shell de ce poste tient-il une session persistante ? Oui par défaut ; non sous Windows, qui n'a
  // ni `tmux` ni `screen` : « + shell » y ouvre un shell qui finit avec son terminal, et rien ne s'en retient.
  persistantIci?: boolean;
  surSortie(id: number, data: string): void;
  // Un terminal a changé : sa note, ou il s'est arrêté.
  surEtat(terminal: Terminal): void;
  // Le fichier où ce second dira ses tours (input.ts). Sans lui, aucun second n'est jamais dit libre : aucun geste direct ne part.
  tours?(id: number): Turns;
  // Ce que l'app laisse à `claude` pour se montrer en mode shell avant qu'elle renonce à son Entrée : une garde, large.
  delaiPreuveMs?: number;
  // Ce que l'app se rappelle des shells persistants. Sans lui, aucun ne revient à la réouverture.
  souvenirs?: Memories;
  // Le `node` qui joue le crochet de la file du second (second/file.ts). Sans lui, le second n'a pas ce crochet.
  node?: string;
  // Le `gh` par lequel ce crochet lit la file sur GitHub — jamais posé hors des essais.
  gh?: string;
  // Le compte de ce poste, pour le bandeau d'un shell. Par défaut : celui de la session ouverte.
  compte?(target: Target): string;
  // Détruit la session d'un shell fermé pour de bon (persistence.ts).
  detruire?(session: Session): Promise<{ detruite: true } | { erreur: string }>;
  // Le plan du second, tel que le runtime le fait (runtime/src/second/lancement.ts, #1433) : ce qui lance `claude`
  // sur ce poste — son chemin, et sous Windows ce qui le lance —, ou pourquoi il ne part pas. Sans lui, `claude` est
  // lancé par son nom.
  planDuSecond?(folder: string, args: readonly string[]): PlanDuSecond;
}) {
  const heldOnes = new Map<number, Tenu>();
  const argsOfShell = options.argsDuShell ?? ["-l"];
  const persistentHere = options.persistantIci ?? true;
  // Un shell fermé ne rend pas son numéro : deux onglets ne portent jamais le même titre.
  const shellsOpen = new Map<string, number>();
  let last = 0;
  let closes = false;

  const destroy = options.detruire ?? ((session: Session) => destroySession(session));

  const shows = ({ id, projet: project, genre: kind, titre: title, note, arrete: stops, bandeau: banner, demandeEcrite: requestWritten, nonParti: notGone, empeche: prevents, manque: lack, aReprendre: aResume }: Tenu): Terminal => ({
    id,
    projet: project,
    genre: kind,
    titre: title,
    note,
    arrete: stops,
    ...(banner === undefined ? {} : { bandeau: banner }),
    ...(requestWritten === undefined ? {} : { demandeEcrite: requestWritten }),
    ...(notGone === undefined ? {} : { nonParti: notGone }),
    ...(prevents === undefined ? {} : { empeche: prevents }),
    ...(lack === undefined ? {} : { manque: lack }),
    ...(aResume === undefined ? {} : { aReprendre: aResume }),
  });
  const of = (project: string) => [...heldOnes.values()].filter((tenu) => tenu.projet === project);

  function hold(project: Project, kind: Terminal["genre"], title: string): Tenu {
    const tenu: Tenu = { id: ++last, projet: project.nom, genre: kind, titre: title, note: "", arrete: false, dossier: project.dossier, cible: { nom: project.nom, ...(project.depot === undefined ? {} : { depot: project.depot }), ...(project.base === undefined ? {} : { base: project.base }) }, colonnes: 80, lignes: 24, lances: 0, ecrit: "" };
    heldOnes.set(tenu.id, tenu);
    return tenu;
  }

  // Le second ne part pas : sa note dit pourquoi, en une phrase, et la vue montre à la place du terminal chaque outil
  // qui manque, avec ce qui l'obtient (#1435). Une touche — ou « try again » — refait le plan.
  function prevent(tenu: Tenu, reason: string, tools: readonly OutilVu[] = []): void {
    tenu.pty = undefined;
    tenu.saisie = undefined;
    tenu.arrete = true;
    tenu.note = reason;
    tenu.empeche = { reason, tools: missing(tools) };
  }

  // `args` : ce que le programme reçoit — ou, pour le second, ce qu'en fait son lancement avec les crochets
  // de ses tours (second/launch.ts).
  function launch(tenu: Tenu, command: string, args: string[] | ((hooks: Hooks) => string[]), onEnd: (code: number) => void): void {
    tenu.arrete = false;
    delete tenu.empeche;
    delete tenu.manque;
    delete tenu.aReprendre;
    // Un second dit ses tours à l'app par ses crochets, dans un fichier qui repart vide avec lui —
    // les réglages suivent ce qui est lancé.
    const turns = tenu.genre === "second" ? options.tours?.(tenu.id) : undefined;
    const all =
      typeof args === "function" ? args(turns === undefined ? {} : hooksOfTurns(turns.chemin)) : turns === undefined ? args : [...args, "--settings", settingsFile(turns.chemin)];
    // Le second part comme le runtime le dit (#1433) : le `claude` que le PATH donne, et sous Windows ce qui le
    // lance — ou il ne part pas, et dit pourquoi. Un outil qui manque sans l'empêcher de partir est dit à côté.
    let launching: Pick<Launch, "commande" | "args" | "verbatim" | "env"> = { commande: command, args: all };
    if (tenu.genre === "second" && options.planDuSecond !== undefined) {
      const plan = options.planDuSecond(tenu.dossier, all);
      if (plan.state !== "ready") return prevent(tenu, plan.reason, plan.tools);
      launching = { commande: plan.launch.command, args: plan.launch.args, verbatim: plan.launch.verbatim, env: plan.launch.env };
      if (plan.missing.length > 0) tenu.manque = { reason: plan.reason ?? "", tools: missing(plan.tools) };
    }
    turns?.vider();
    const input = tenu.genre === "second" ? followInput(() => turns?.lire() ?? "") : undefined;
    tenu.saisie = input;
    const launches = ++tenu.lances;
    try {
      tenu.pty = open(tenu, launching, input, launches, onEnd);
    } catch (error) {
      // Un lancement refusé — un programme introuvable, un pty qui ne s'ouvre pas — se dit : jamais un onglet muet.
      const why = String(error instanceof Error ? error.message : error).replace(/[.\s]+$/, "");
      if (tenu.genre === "second") return prevent(tenu, `The second cannot start: launching ${launching.commande} failed (${why}).`);
      tenu.pty = undefined;
      tenu.arrete = true;
      tenu.note = `this shell could not start: launching ${launching.commande} failed (${why})`;
    }
  }

  function open(tenu: Tenu, launching: Pick<Launch, "commande" | "args" | "verbatim" | "env">, input: Input | undefined, launches: number, onEnd: (code: number) => void): Pty {
    return options.ouvrirPty({
      ...launching,
      dossier: tenu.dossier,
      colonnes: tenu.colonnes,
      lignes: tenu.lignes,
      surSortie: (data) => {
        tenu.ecrit += data;
        if (tenu.ecrit.length > 2 * HELD) tenu.ecrit = tenu.ecrit.slice(-HELD);
        input?.sortie(data);
        options.surSortie(tenu.id, data);
      },
      surFin: (code) => {
        // À la fermeture de l'app, tout meurt : il n'y a plus rien à dire, ni à relancer.
        // Pareil pour un terminal dont le projet a quitté la liste.
        // Et pour un pty que l'app a remplacé : la fin de l'ancien ne dit rien du nouveau.
        if (closes || heldOnes.get(tenu.id) !== tenu || tenu.lances !== launches) return;
        tenu.pty = undefined;
        // Une commande que l'app y avait écrite ne partira plus.
        input?.renoncer();
        onEnd(code);
        options.surEtat(shows(tenu));
      },
    });
  }

  const secondOf = (project: Project) => of(project.nom).find(({ genre: kind }) => kind === "second") ?? hold(project, "second", TITLE_SECOND);
  const stops = (code: number) => `the second stopped (code ${code}) — a keypress restarts it`;

  // Le rôle du second, ajouté au prompt système de chaque `claude` que l'onglet lance comme second —
  // reprise comme session neuve (second/launch.ts). Sans lui l'onglet ne serait qu'un `claude` nu
  // qui s'appelle Second.
  const ROLE = "with the second's role in its system prompt";
  // Un onglet nommé Second est un onglet où le rôle est établi.
  const TITLE_SECOND = "Second";
  // Une session ouverte sur une autre commande (`/brigade:init`) n'est pas le second : l'onglet ne le prétend pas.
  const TITLE_OTHER = "Claude";

  // Le second reprend le fil de ce dossier si `claude` en a un, avec le rôle.
  // Ce fil est la dernière conversation du dossier, pas forcément celle
  // d'un second : la note le dit. Il n'y en a pas — ou `claude` n'a pas su le
  // reprendre — quand `claude --continue` sort en erreur : une session neuve
  // part alors, une seule fois, avec le rôle, et sa note le dit.
  // La file du projet, lue à chaque début de session et après chaque compaction (second/file.ts, déclaré par
  // second/hook-of-the-file.ts).
  const theFile = (tenu: Tenu): Hooks => (options.node === undefined ? {} : hooksOfTheFile({ node: options.node, gh: options.gh ?? "gh", cible: tenu.cible }));

  // Le rôle redit au prompt qui suit le merge de l'init, quand la session est née sans les bindings
  // (second/role-after-init.ts, déclaré par second/hook-of-role.ts).
  const theRole = (tenu: Tenu): Hooks => (options.node === undefined ? {} : hooksOfRole({ node: options.node, gh: options.gh ?? "gh", cible: tenu.cible }));

  // La commande qui parque et déparque un ticket comme les boutons de l'app, donnée à chaque début de session
  // (second/parking.ts, déclarée par second/hook-of-parking.ts, #4262).
  const theParking = (tenu: Tenu): Hooks => (options.node === undefined ? {} : hooksOfParking({ node: options.node, cible: tenu.cible }));

  // Ce que le second ne fait jamais — merger, lire les secrets du chef — refusé avant l'appel (second/refusal.ts).
  const theRefusal = (): Hooks => (options.node === undefined ? {} : hooksOfRefusal({ node: options.node }));

  function launchSecond(tenu: Tenu, resumption: boolean): void {
    tenu.titre = TITLE_SECOND;
    if (resumption) tenu.note = `thread resumed: \`claude --continue\`, the latest conversation in this folder — whichever it is, not necessarily a second's; it runs ${ROLE}`;
    else tenu.note = `new session: \`claude\`, ${ROLE}`;
    launch(tenu, options.claude, (hooks) => argumentsOfSecond({ reprise: resumption, reglages: settingsOfSecond(hooks, theFile(tenu), theRefusal(), theRole(tenu), theParking(tenu)) }), (code) => {
      if (resumption && code !== 0) {
        launchSecond(tenu, false);
        if (tenu.empeche === undefined) tenu.note = `new session: \`claude --continue\` exited with code ${code}, the thread was not resumed — \`claude\`, ${ROLE}`;
      } else {
        tenu.arrete = true;
        tenu.note = stops(code);
      }
    });
  }

  // Un bouton écrit sa commande dans le second du projet, et rien qui l'envoie :
  // c'est le chef qui fait Entrée. L'app ne lit pas le terminal — elle ne sait
  // pas s'il était en train de taper : elle écrit à la suite, et la note le dit.
  // Ni ce que `claude` affiche : devant un dialogue ou en mode vim, ce qui est
  // écrit est pris pour des touches. La note ne promet donc pas que rien n'est parti.
  // Un second qui ne tourne pas est lancé d'abord, et rien n'y est écrit : ce
  // qui démarre prendrait la commande pour des touches.
  // `dit` : ce que la note rend de ce qui est écrit, quand ce n'est pas une commande
  // (request.ts), selon que le second était devant un dialogue.
  function register(project: Project, command: string, said?: (inFrontOneDialog: boolean) => string): Terminal {
    const second = secondOf(project);
    delete second.nonParti;
    if (CONTROL.test(command)) {
      second.note = WITHOUT_WRITE;
      second.nonParti = true;
      delete second.demandeEcrite;
      if (second.pty === undefined) second.arrete = true;
    } else if (second.pty === undefined) {
      launchSecond(second, true);
      delete second.demandeEcrite;
      second.nonParti = true;
      if (second.empeche === undefined) second.note = `the second was not running: launched (\`claude --continue\`, ${ROLE}) — the command is not written into a second that is starting, click again when it is ready`;
    } else {
      // Devant un dialogue : le second attend une réponse, et ces caractères y seraient des touches.
      const state = second.saisie?.etat();
      const inFrontOneDialog = state !== undefined && !state.libre && state.dit === SAYS.attend;
      second.pty.ecrire(command);
      // La saisie n'est plus vide : un geste direct ne s'y écrira pas à la suite.
      second.saisie?.entamer();
      if (said !== undefined) second.demandeEcrite = true;
      else delete second.demandeEcrite;
      second.note = said?.(inFrontOneDialog) ?? `written into the second, without Enter: \`${command}\` — at \`claude\`'s prompt, it waits for yours, after your typing if you were typing. On any other screen (a choice to make, vim mode), these characters are keystrokes: look at the second before confirming`;
    }
    return shows(second);
  }

  // Un geste direct : sa commande part vraiment — écrite dans le second, puis envoyée par
  // l'app — et sa sortie se lit dans son fil. Elle ne part que d'un second dit libre (input.ts) :
  // occupé, devant un dialogue, saisie entamée ou état inconnu, rien n'est écrit, et le refus dit
  // pourquoi. Écrite dans un second occupé elle ne serait pas perdue, mais mise en file : elle
  // partirait seule, plus tard. Et l'Entrée n'est faite que sur preuve : `claude` s'est montré en
  // mode shell, c'est donc bien sa commande, seule, qui est dans sa saisie. Sans preuve, la
  // commande reste écrite, et la note dit que rien n'est parti.
  function send(project: Project, command: string): Promise<Terminal | { refus: string }> {
    if (CONTROL.test(command)) return Promise.resolve({ refus: WITHOUT_WRITE });
    const second = secondOf(project);
    delete second.nonParti;
    const { pty, saisie: input } = second;
    if (pty === undefined || input === undefined) {
      launchSecond(second, true);
      second.nonParti = true;
      if (second.empeche === undefined) second.note = `the second was not running: launched (\`claude --continue\`, ${ROLE}) — the command did not go: a second that is starting takes nothing, click again when it has finished its first turn`;
      return Promise.resolve(shows(second));
    }
    const state = input.etat();
    if (!state.libre) return Promise.resolve({ refus: `${state.dit} — the command did not go, and nothing is written: \`${command}\`` });
    return new Promise((render) => {
      const guard = setTimeout(input.renoncer, options.delaiPreuveMs ?? 5_000);
      input.ecrit((proof) => {
        clearTimeout(guard);
        // Le second arrêté entre-temps a sa propre note, et plus de saisie.
        if (second.pty !== pty) {
          second.nonParti = true;
          return render(shows(second));
        }
        if (proof) {
          pty.ecrire("\r");
          input.parti();
          second.note = `sent to the second: \`${command}\` — \`claude\` went into shell mode, the app pressed Enter. Its output is read in its thread, and the second reads it too`;
        } else {
          second.nonParti = true;
          second.note = `written into the second, but not sent: \`${command}\` — \`claude\` did not show itself in shell mode (“${PROOF}”), so the app did not press Enter. Its input was not empty, or it was showing something other than its prompt: look at the second, and erase what is written there`;
        }
        render(shows(second));
      });
      pty.ecrire(command);
    });
  }

  // Un shell de ce poste, sans session : il finit avec l'app, ou quand le chef y tape `exit`.
  function shellHere(project: Project, note: string): Tenu {
    const rank = rankNew(project.nom);
    const tenu = hold(project, "shell", `shell ${rank}`);
    tenu.note = note;
    launch(tenu, options.shell, [...argsOfShell], () => {
      tenu.arrete = true;
      heldOnes.delete(tenu.id);
    });
    return tenu;
  }

  // --- Les shells persistants.

  const reminder = (): Reminder => options.souvenirs?.lire() ?? {};

  // Un rang neuf dans le projet : ni celui d'un shell ouvert depuis le lancement, ni celui d'un
  // shell dont l'app se souvient — deux onglets n'ont pas le même titre, deux shells pas la même session.
  function rankNew(project: string): number {
    const rank = Math.max(shellsOpen.get(project) ?? 0, reminder()[project]?.dernier ?? 0) + 1;
    shellsOpen.set(project, rank);
    return rank;
  }

  function retain(project: string, memory: Memory): void {
    if (options.souvenirs === undefined) return;
    const all = reminder();
    const before = all[project] ?? { dernier: 0, shells: [] };
    all[project] = { dernier: Math.max(before.dernier, memory.rang), shells: [...before.shells.filter(({ rang: rank }) => rank !== memory.rang), memory] };
    options.souvenirs.ecrire(all);
  }

  function forget(project: string, rank: number): void {
    if (options.souvenirs === undefined) return;
    const all = reminder();
    const before = all[project];
    if (before === undefined || !before.shells.some((shell) => shell.rang === rank)) return;
    all[project] = { ...before, shells: before.shells.filter((shell) => shell.rang !== rank) };
    options.souvenirs.ecrire(all);
  }

  const titleOf = (rank: number) => `shell ${rank}`;
  const whereIs = (folder: string) => `${HERE}, in ${folder}`;

  // Lance le shell dans sa session — la même commande la crée ou s'y rattache. Il finit quand sa
  // session finit (le chef y a tapé `exit`) : il quitte l'espace, et l'app l'oublie.
  function attach(project: Project, persistent: NonNullable<Tenu["persistant"]>, comment: string): Tenu {
    const { session } = persistent;
    const tenu = hold(project, "shell", titleOf(persistent.rang));
    tenu.persistant = persistent;
    tenu.ici = textBanner(session.cible, (options.compte ?? accountOf)(session.cible));
    tenu.bandeau = tenu.ici;
    tenu.note = `${comment} on ${whereIs(project.dossier)} — session \`${session.nom}\`: closing the app only detaches from it, closing this shell destroys it`;
    bind(tenu);
    return tenu;
  }

  function bind(tenu: Tenu): void {
    const persistent = tenu.persistant;
    if (persistent === undefined) return;
    const { rang: rank, session } = persistent;
    const { commande: command, args } = attachment(session);
    launch(tenu, command, args, () => {
      tenu.arrete = true;
      heldOnes.delete(tenu.id);
      forget(tenu.projet, rank);
    });
  }

  // Le pty d'un terminal s'arrête.
  function stop(tenu: Tenu): void {
    tenu.saisie?.renoncer();
    tenu.pty?.tuer();
  }

  // Les shells dont l'app se souvient pour ce projet, rattachés à leur session, dans l'ordre de leurs rangs.
  function comeBack(project: Project): void {
    const remembered = [...(reminder()[project.nom]?.shells ?? [])].sort((a, b) => a.rang - b.rang);
    for (const { rang: rank, session, cible: target } of remembered) if (persistentHere) attach(project, { rang: rank, session: { nom: session, cible: target } }, "persistent shell, reattached");
  }

  return {
    // Les terminaux d'un projet. Le premier appel lance son second, et ramène les shells
    // persistants que l'app avait à sa dernière fermeture ; les suivants les retrouvent tels qu'ils sont.
    espace(project: Project): Terminal[] {
      if (of(project.nom).length === 0) {
        launchSecond(hold(project, "second", TITLE_SECOND), true);
        comeBack(project);
      }
      return of(project.nom).map(shows);
    },

    // Tous les terminaux ouverts, de tous les projets, pour une vue qui se recharge (#3159) : chacun y retrouve son onglet,
    // et ce qu'il avait écrit. Rien n'est lancé : un second qui tourne est rattaché tel quel, sans être relancé, et ce
    // qu'il écrit ensuite arrive par `surSortie`. Un second qui ne tourne plus n'a pas pu l'être : sa note le dit, en une
    // ligne, et la vue pose de quoi le reprendre. Un second qui ne part pas (`empeche`) garde la sienne, et son « try again ».
    ouverts(): Open[] {
      return [...heldOnes.values()].map((tenu) => {
        if (tenu.genre === "second" && tenu.pty === undefined && tenu.empeche === undefined) {
          tenu.arrete = true;
          tenu.aReprendre = true;
          tenu.note = "the second was not running when the window reloaded: it could not be reattached — resume it";
        }
        return { terminal: shows(tenu), ecrit: sinceOneLine(tenu.ecrit) };
      });
    },

    // Les pages que les seconds ont nommées pour obtenir un outil qui manque (#1435) : seules celles-là s'ouvrent
    // depuis leur colonne.
    pagesDesOutils(): Set<string> {
      return new Set([...heldOnes.values()].flatMap(({ empeche: prevents, manque: lack }) => [...(prevents?.tools ?? []), ...(lack?.tools ?? [])].map(({ link }) => link)));
    },

    // Un shell persistant, sur la machine choisie : une session neuve, que l'app retient.
    ouvrir(project: Project, target: Target): Terminal {
      // Sans session sur ce poste (Windows) : un shell qui finit avec son terminal, sous le même bandeau qu'ailleurs.
      if (target.lieu === "poste" && !persistentHere) {
        const tenu = shellHere(project, `shell on ${HERE}, in ${project.dossier} — ${WITHOUT_SESSION}`);
        tenu.bandeau = textBanner(target, (options.compte ?? accountOf)(target));
        return shows(tenu);
      }
      const rank = rankNew(project.nom);
      const session = { nom: nameOfSession(project.nom, rank), cible: target };
      retain(project.nom, { rang: rank, session: session.nom, cible: target });
      return shows(attach(project, { rang: rank, session }, "persistent shell"));
    },

    // Le chef ferme un shell : il quitte l'espace tout de suite, l'app l'oublie, et sa session est
    // détruite — il ne revient plus. Rend la raison, quand elle n'a pas pu l'être : elle reste alors
    // sur sa machine, et la raison dit laquelle. Le second ne se ferme pas ainsi.
    async fermerShell(id: number): Promise<{ ferme: true } | { refus: string }> {
      const tenu = heldOnes.get(id);
      if (tenu === undefined || tenu.genre !== "shell") return { refus: "nothing was closed: this shell is no longer open" };
      heldOnes.delete(id);
      tenu.arrete = true;
      stop(tenu);
      options.surEtat(shows(tenu));
      if (tenu.persistant === undefined) return { ferme: true };
      const { rang: rank, session } = tenu.persistant;
      forget(tenu.projet, rank);
      const destroyed = await destroy(session);
      if ("detruite" in destroyed) return { ferme: true };
      return { refus: `${tenu.titre} is closed, but its session \`${session.nom}\` could not be destroyed on ${HERE}: it is no longer listed, and stays there until it is destroyed — ${destroyed.erreur}` };
    },

    // `ecrit` : une commande à écrire dans ce shell, sans rien qui l'envoie — pour un
    // geste qui réclame un vrai terminal, ce que le `!` du second ne donne pas. Un shell
    // de connexion garde ce qui lui arrive avant son invite : la commande l'y attend.
    shell(project: Project, written?: string): Terminal {
      const tenu = shellHere(project, `shell on ${HERE}, in ${project.dossier}`);
      if (written !== undefined && CONTROL.test(written)) tenu.note = WITHOUT_WRITE;
      else if (written !== undefined) {
        tenu.pty?.ecrire(written);
        tenu.note = `written into this shell, without Enter: \`${written}\` — yours is what sends it. A real terminal: what the command asks for — a password — is typed here`;
      }
      return shows(tenu);
    },

    // Une session du second ouverte sur une commande de `claude` — `/brigade:init`,
    // pour amorcer le dépôt : une conversation neuve, pas le fil repris. Un second
    // qui tourne déjà n'est pas remplacé : la commande y est écrite, comme par un bouton.
    session(project: Project, command: string): Terminal {
      const second = secondOf(project);
      if (second.pty !== undefined || CONTROL.test(command)) return register(project, command);
      second.titre = TITLE_OTHER;
      second.note = `session launched on \`${command}\`: \`claude ${command}\`, a new conversation in this folder — it is not the second: it runs without the second's role`;
      launch(second, options.claude, [command], (code) => {
        second.arrete = true;
        second.note = stops(code);
      });
      return shows(second);
    },

    ecrire(id: number, data: string): void {
      const tenu = heldOnes.get(id);
      if (tenu === undefined) return;
      if (tenu.pty !== undefined) {
        // Ce que le chef tape dans le second se compte : sa saisie n'est dite vide qu'après son Entrée.
        tenu.saisie?.frappe(data);
        tenu.pty.ecrire(data);
        // La demande est envoyée : son bandeau n'a plus de raison d'être.
        if (data === "\r" && tenu.demandeEcrite !== undefined) {
          delete tenu.demandeEcrite;
          tenu.note = "";
          options.surEtat(shows(tenu));
        }
      } else if (tenu.genre === "second") {
        launchSecond(tenu, true);
        options.surEtat(shows(tenu));
      }
    },

    inscrire: register,

    envoyer: send,

    redimensionner(id: number, columns: number, lines: number): void {
      const tenu = heldOnes.get(id);
      if (tenu === undefined) return;
      // Gardée même sans pty : un second relancé repart à la taille de sa vue.
      tenu.colonnes = columns;
      tenu.lignes = lines;
      tenu.pty?.redimensionner(columns, lines);
    },

    // Le projet a quitté la liste : ses terminaux sont arrêtés. Rend leurs numéros.
    quitter(project: string): number[] {
      return of(project).map((tenu) => {
        heldOnes.delete(tenu.id);
        stop(tenu);
        return tenu.id;
      });
    },

    fermer(): void {
      closes = true;
      for (const tenu of heldOnes.values()) stop(tenu);
      heldOnes.clear();
    },
  };
}
