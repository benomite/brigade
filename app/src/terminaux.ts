// Le registre des terminaux : un second par projet, et les shells ouverts à
// côté. Il vit dans le process principal — aucune vue ne tient un pty : changer
// d'espace, ou d'onglet, ne peut donc rien interrompre.
//
// Un shell que le chef ouvre par « + shell » est persistant (persistance.ts) : il vit dans une
// session, sur la machine choisie (machines.ts), et l'app s'en souvient (souvenirs.ts). Fermer
// l'app ne fait que s'en détacher : à la réouverture, il revient dans l'espace de son projet,
// rattaché à sa session. Seule sa fermeture par le chef la détruit. Le shell qu'un geste ouvre
// pour y écrire sa commande, lui, est un shell de ce poste qui finit avec l'app — comme, sous
// Windows, celui que « + shell » ouvre sur ce poste : il n'y a pas de session où le tenir.
import { compteDe, texteBandeau } from "./bandeau.ts";
import type { Projet } from "./config.ts";
import { ICI, SANS_SESSION } from "./plateforme.ts";
import { detruire as detruireSession, nomDeSession, rattachement, type Cible, type Session } from "./persistance.ts";
import { crochetsDesTours, DIT, PREUVE, reglages, suivreSaisie, type Saisie, type Tours } from "./saisie.ts";
import { crochetsDeLaFile } from "./second/crochet-de-la-file.ts";
import { crochetsDuRefus } from "./second/refus.ts";
import { argumentsDuSecond, reglagesDuSecond, type Crochets } from "./second/lancement.ts";
import type { Rappel, Souvenir, Souvenirs } from "./souvenirs.ts";
import type { OutilVu } from "../../runtime/src/second/outils.ts";
import type { PlanDuSecond } from "../../runtime/src/second/lancement.ts";

export type Pty = {
  ecrire(donnees: string): void;
  redimensionner(colonnes: number, lignes: number): void;
  tuer(): void;
};

export type Lancement = {
  commande: string;
  args: string[];
  dossier: string;
  colonnes: number;
  lignes: number;
  surSortie(donnees: string): void;
  surFin(code: number): void;
  // Ce que le plan du second y ajoute (runtime/src/second/lancement.ts, #1433) : `verbatim`, les `args` sont une
  // ligne déjà écrite pour Windows, que rien ne doit plus citer ; `env`, ce qui s'ajoute à l'environnement du chef.
  verbatim?: boolean;
  env?: Record<string, string>;
};

// Un outil qui manque au second (runtime/src/second/outils.ts, #1433) : son nom, pourquoi le second en a besoin, la
// phrase qui dit comment l'obtenir sur ce poste, et la page qui l'explique.
export type OutilManquant = { tool: string; reason: string; install: string; link: string };
// Ce que le plan du second dit de lui, en une phrase, et chaque outil qui manque (#1435).
export type DitDuSecond = { reason: string; tools: OutilManquant[] };

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
  empeche?: DitDuSecond;
  // Il part, mais des outils lui manquent : ce qui en a besoin échouera tant qu'ils ne sont pas installés.
  manque?: DitDuSecond;
};

export type Terminaux = ReturnType<typeof ouvrirTerminaux>;

// Les outils que le plan dit absents, avec ce qui les obtient — rien d'autre de ce qu'il a vu.
const manquants = (tools: readonly OutilVu[]): OutilManquant[] =>
  tools.flatMap((vu) => (vu.present ? [] : [{ tool: vu.tool, reason: vu.reason, install: vu.install, link: vu.link }]));

// `saisie` : ce que l'app sait de la saisie d'un second qui tourne (saisie.ts).
// `persistant` : la session d'un shell persistant, et son rang dans le projet.
// `lances` : le numéro du dernier lancement — la fin d'un pty que l'app a remplacé ne dit plus rien.
// `ici` : le bandeau d'un shell persistant tel qu'il est quand sa machine répond.
// `ici` : le bandeau d'un shell persistant.
type Tenu = Terminal & {
  dossier: string;
  // Le projet tel que la file se lit : son nom, et son dépôt GitHub quand le fichier des projets le donne.
  cible: { nom: string; depot?: string };
  colonnes: number;
  lignes: number;
  lances: number;
  pty?: Pty;
  saisie?: Saisie;
  persistant?: { rang: number; session: Session };
  ici?: string;
};

// Ce qui ne s'écrit jamais dans un terminal à la place du chef : un retour à la
// ligne enverrait la commande, et tout autre caractère de contrôle y est une touche.
// Qui prépare une commande (gestes.ts) la refuse par la même règle, avant d'ouvrir un shell.
export const CONTROLE = /[\x00-\x1f\x7f]/;
export const SANS_ECRIRE = "nothing is written: the command carries a control character, and a line break would have sent it — check “nom” of this project in the projects file";

export function ouvrirTerminaux(options: {
  ouvrirPty(lancement: Lancement): Pty;
  claude: string;
  // Le shell de ce poste, et ses arguments — `-l` par défaut : un shell de connexion (plateforme.ts).
  shell: string;
  argsDuShell?: readonly string[];
  // Un shell de ce poste tient-il une session persistante ? Oui par défaut ; non sous Windows, qui n'a
  // ni `tmux` ni `screen` : « + shell » y ouvre un shell qui finit avec son terminal, et rien ne s'en retient.
  persistantIci?: boolean;
  surSortie(id: number, donnees: string): void;
  // Un terminal a changé : sa note, ou il s'est arrêté.
  surEtat(terminal: Terminal): void;
  // Le fichier où ce second dira ses tours (saisie.ts). Sans lui, aucun second n'est jamais dit libre : aucun geste direct ne part.
  tours?(id: number): Tours;
  // Ce que l'app laisse à `claude` pour se montrer en mode shell avant qu'elle renonce à son Entrée : une garde, large.
  delaiPreuveMs?: number;
  // Ce que l'app se rappelle des shells persistants. Sans lui, aucun ne revient à la réouverture.
  souvenirs?: Souvenirs;
  // Le `node` qui joue le crochet de la file du second (second/file.ts). Sans lui, le second n'a pas ce crochet.
  node?: string;
  // Le `gh` par lequel ce crochet lit la file sur le tableau de la cuisine — jamais posé hors des essais.
  gh?: string;
  // Le compte de ce poste, pour le bandeau d'un shell. Par défaut : celui de la session ouverte.
  compte?(cible: Cible): string;
  // Détruit la session d'un shell fermé pour de bon (persistance.ts).
  detruire?(session: Session): Promise<{ detruite: true } | { erreur: string }>;
  // Le plan du second, tel que le runtime le fait (runtime/src/second/lancement.ts, #1433) : ce qui lance `claude`
  // sur ce poste — son chemin, et sous Windows ce qui le lance —, ou pourquoi il ne part pas. Sans lui, `claude` est
  // lancé par son nom.
  planDuSecond?(dossier: string, args: readonly string[]): PlanDuSecond;
}) {
  const tenus = new Map<number, Tenu>();
  const argsDuShell = options.argsDuShell ?? ["-l"];
  const persistantIci = options.persistantIci ?? true;
  // Un shell fermé ne rend pas son numéro : deux onglets ne portent jamais le même titre.
  const shellsOuverts = new Map<string, number>();
  let dernier = 0;
  let ferme = false;

  const detruire = options.detruire ?? ((session: Session) => detruireSession(session));

  const montre = ({ id, projet, genre, titre, note, arrete, bandeau, demandeEcrite, nonParti, empeche, manque }: Tenu): Terminal => ({
    id,
    projet,
    genre,
    titre,
    note,
    arrete,
    ...(bandeau === undefined ? {} : { bandeau }),
    ...(demandeEcrite === undefined ? {} : { demandeEcrite }),
    ...(nonParti === undefined ? {} : { nonParti }),
    ...(empeche === undefined ? {} : { empeche }),
    ...(manque === undefined ? {} : { manque }),
  });
  const de = (projet: string) => [...tenus.values()].filter((tenu) => tenu.projet === projet);

  function tenir(projet: Projet, genre: Terminal["genre"], titre: string): Tenu {
    const tenu: Tenu = { id: ++dernier, projet: projet.nom, genre, titre, note: "", arrete: false, dossier: projet.dossier, cible: { nom: projet.nom, ...(projet.depot === undefined ? {} : { depot: projet.depot }) }, colonnes: 80, lignes: 24, lances: 0 };
    tenus.set(tenu.id, tenu);
    return tenu;
  }

  // Le second ne part pas : sa note dit pourquoi, en une phrase, et la vue montre à la place du terminal chaque outil
  // qui manque, avec ce qui l'obtient (#1435). Une touche — ou « try again » — refait le plan.
  function empecher(tenu: Tenu, reason: string, tools: readonly OutilVu[] = []): void {
    tenu.pty = undefined;
    tenu.saisie = undefined;
    tenu.arrete = true;
    tenu.note = reason;
    tenu.empeche = { reason, tools: manquants(tools) };
  }

  // `args` : ce que le programme reçoit — ou, pour le second, ce qu'en fait son lancement avec les crochets
  // de ses tours (second/lancement.ts).
  function lancer(tenu: Tenu, commande: string, args: string[] | ((crochets: Crochets) => string[]), surFin: (code: number) => void): void {
    tenu.arrete = false;
    delete tenu.empeche;
    delete tenu.manque;
    // Un second dit ses tours à l'app par ses crochets, dans un fichier qui repart vide avec lui —
    // les réglages suivent ce qui est lancé.
    const tours = tenu.genre === "second" ? options.tours?.(tenu.id) : undefined;
    const tous =
      typeof args === "function" ? args(tours === undefined ? {} : crochetsDesTours(tours.chemin)) : tours === undefined ? args : [...args, "--settings", reglages(tours.chemin)];
    // Le second part comme le runtime le dit (#1433) : le `claude` que le PATH donne, et sous Windows ce qui le
    // lance — ou il ne part pas, et dit pourquoi. Un outil qui manque sans l'empêcher de partir est dit à côté.
    let lancement: Pick<Lancement, "commande" | "args" | "verbatim" | "env"> = { commande, args: tous };
    if (tenu.genre === "second" && options.planDuSecond !== undefined) {
      const plan = options.planDuSecond(tenu.dossier, tous);
      if (plan.state !== "ready") return empecher(tenu, plan.reason, plan.tools);
      lancement = { commande: plan.launch.command, args: plan.launch.args, verbatim: plan.launch.verbatim, env: plan.launch.env };
      if (plan.missing.length > 0) tenu.manque = { reason: plan.reason ?? "", tools: manquants(plan.tools) };
    }
    tours?.vider();
    const saisie = tenu.genre === "second" ? suivreSaisie(() => tours?.lire() ?? "") : undefined;
    tenu.saisie = saisie;
    const lance = ++tenu.lances;
    try {
      tenu.pty = ouvrir(tenu, lancement, saisie, lance, surFin);
    } catch (erreur) {
      // Un lancement refusé — un programme introuvable, un pty qui ne s'ouvre pas — se dit : jamais un onglet muet.
      const pourquoi = String(erreur instanceof Error ? erreur.message : erreur).replace(/[.\s]+$/, "");
      if (tenu.genre === "second") return empecher(tenu, `The second cannot start: launching ${lancement.commande} failed (${pourquoi}).`);
      tenu.pty = undefined;
      tenu.arrete = true;
      tenu.note = `this shell could not start: launching ${lancement.commande} failed (${pourquoi})`;
    }
  }

  function ouvrir(tenu: Tenu, lancement: Pick<Lancement, "commande" | "args" | "verbatim" | "env">, saisie: Saisie | undefined, lance: number, surFin: (code: number) => void): Pty {
    return options.ouvrirPty({
      ...lancement,
      dossier: tenu.dossier,
      colonnes: tenu.colonnes,
      lignes: tenu.lignes,
      surSortie: (donnees) => {
        saisie?.sortie(donnees);
        options.surSortie(tenu.id, donnees);
      },
      surFin: (code) => {
        // À la fermeture de l'app, tout meurt : il n'y a plus rien à dire, ni à relancer.
        // Pareil pour un terminal dont le projet a quitté la liste.
        // Et pour un pty que l'app a remplacé : la fin de l'ancien ne dit rien du nouveau.
        if (ferme || tenus.get(tenu.id) !== tenu || tenu.lances !== lance) return;
        tenu.pty = undefined;
        // Une commande que l'app y avait écrite ne partira plus.
        saisie?.renoncer();
        surFin(code);
        options.surEtat(montre(tenu));
      },
    });
  }

  const secondDe = (projet: Projet) => de(projet.nom).find(({ genre }) => genre === "second") ?? tenir(projet, "second", TITRE_SECOND);
  const arrete = (code: number) => `the second stopped (code ${code}) — a keypress restarts it`;

  // Le rôle du second, ajouté au prompt système de chaque `claude` que l'onglet lance comme second —
  // reprise comme session neuve (second/lancement.ts). Sans lui l'onglet ne serait qu'un `claude` nu
  // qui s'appelle Second.
  const ROLE = "with the second's role in its system prompt";
  // Un onglet nommé Second est un onglet où le rôle est établi.
  const TITRE_SECOND = "Second";
  // Une session ouverte sur une autre commande (`/brigade:init`) n'est pas le second : l'onglet ne le prétend pas.
  const TITRE_AUTRE = "Claude";

  // Le second reprend le fil de ce dossier si `claude` en a un, avec le rôle.
  // Ce fil est la dernière conversation du dossier, pas forcément celle
  // d'un second : la note le dit. Il n'y en a pas — ou `claude` n'a pas su le
  // reprendre — quand `claude --continue` sort en erreur : une session neuve
  // part alors, une seule fois, avec le rôle, et sa note le dit.
  // La file du projet, lue à chaque début de session et après chaque compaction (second/file.ts, déclaré par
  // second/crochet-de-la-file.ts).
  const laFile = (tenu: Tenu): Crochets => (options.node === undefined ? {} : crochetsDeLaFile({ node: options.node, gh: options.gh ?? "gh", cible: tenu.cible }));

  // Ce que le second ne fait jamais — merger, lire les secrets du chef — refusé avant l'appel (second/refus.ts).
  const lesRefus = (): Crochets => (options.node === undefined ? {} : crochetsDuRefus({ node: options.node }));

  function lancerSecond(tenu: Tenu, reprise: boolean): void {
    tenu.titre = TITRE_SECOND;
    if (reprise) tenu.note = `thread resumed: \`claude --continue\`, the latest conversation in this folder — whichever it is, not necessarily a second's; it runs ${ROLE}`;
    else tenu.note = `new session: \`claude\`, ${ROLE}`;
    lancer(tenu, options.claude, (crochets) => argumentsDuSecond({ reprise, reglages: reglagesDuSecond(crochets, laFile(tenu), lesRefus()) }), (code) => {
      if (reprise && code !== 0) {
        lancerSecond(tenu, false);
        if (tenu.empeche === undefined) tenu.note = `new session: \`claude --continue\` exited with code ${code}, the thread was not resumed — \`claude\`, ${ROLE}`;
      } else {
        tenu.arrete = true;
        tenu.note = arrete(code);
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
  // (demande.ts), selon que le second était devant un dialogue.
  function inscrire(projet: Projet, commande: string, dit?: (devantUnDialogue: boolean) => string): Terminal {
    const second = secondDe(projet);
    delete second.nonParti;
    if (CONTROLE.test(commande)) {
      second.note = SANS_ECRIRE;
      second.nonParti = true;
      delete second.demandeEcrite;
      if (second.pty === undefined) second.arrete = true;
    } else if (second.pty === undefined) {
      lancerSecond(second, true);
      delete second.demandeEcrite;
      second.nonParti = true;
      if (second.empeche === undefined) second.note = `the second was not running: launched (\`claude --continue\`, ${ROLE}) — the command is not written into a second that is starting, click again when it is ready`;
    } else {
      // Devant un dialogue : le second attend une réponse, et ces caractères y seraient des touches.
      const etat = second.saisie?.etat();
      const devantUnDialogue = etat !== undefined && !etat.libre && etat.dit === DIT.attend;
      second.pty.ecrire(commande);
      // La saisie n'est plus vide : un geste direct ne s'y écrira pas à la suite.
      second.saisie?.entamer();
      if (dit !== undefined) second.demandeEcrite = true;
      else delete second.demandeEcrite;
      second.note = dit?.(devantUnDialogue) ?? `written into the second, without Enter: \`${commande}\` — at \`claude\`'s prompt, it waits for yours, after your typing if you were typing. On any other screen (a choice to make, vim mode), these characters are keystrokes: look at the second before confirming`;
    }
    return montre(second);
  }

  // Un geste direct : sa commande part vraiment — écrite dans le second, puis envoyée par
  // l'app — et sa sortie se lit dans son fil. Elle ne part que d'un second dit libre (saisie.ts) :
  // occupé, devant un dialogue, saisie entamée ou état inconnu, rien n'est écrit, et le refus dit
  // pourquoi. Écrite dans un second occupé elle ne serait pas perdue, mais mise en file : elle
  // partirait seule, plus tard. Et l'Entrée n'est faite que sur preuve : `claude` s'est montré en
  // mode shell, c'est donc bien sa commande, seule, qui est dans sa saisie. Sans preuve, la
  // commande reste écrite, et la note dit que rien n'est parti.
  function envoyer(projet: Projet, commande: string): Promise<Terminal | { refus: string }> {
    if (CONTROLE.test(commande)) return Promise.resolve({ refus: SANS_ECRIRE });
    const second = secondDe(projet);
    delete second.nonParti;
    const { pty, saisie } = second;
    if (pty === undefined || saisie === undefined) {
      lancerSecond(second, true);
      second.nonParti = true;
      if (second.empeche === undefined) second.note = `the second was not running: launched (\`claude --continue\`, ${ROLE}) — the command did not go: a second that is starting takes nothing, click again when it has finished its first turn`;
      return Promise.resolve(montre(second));
    }
    const etat = saisie.etat();
    if (!etat.libre) return Promise.resolve({ refus: `${etat.dit} — the command did not go, and nothing is written: \`${commande}\`` });
    return new Promise((rendre) => {
      const garde = setTimeout(saisie.renoncer, options.delaiPreuveMs ?? 5_000);
      saisie.ecrit((preuve) => {
        clearTimeout(garde);
        // Le second arrêté entre-temps a sa propre note, et plus de saisie.
        if (second.pty !== pty) {
          second.nonParti = true;
          return rendre(montre(second));
        }
        if (preuve) {
          pty.ecrire("\r");
          saisie.parti();
          second.note = `sent to the second: \`${commande}\` — \`claude\` went into shell mode, the app pressed Enter. Its output is read in its thread, and the second reads it too`;
        } else {
          second.nonParti = true;
          second.note = `written into the second, but not sent: \`${commande}\` — \`claude\` did not show itself in shell mode (“${PREUVE}”), so the app did not press Enter. Its input was not empty, or it was showing something other than its prompt: look at the second, and erase what is written there`;
        }
        rendre(montre(second));
      });
      pty.ecrire(commande);
    });
  }

  // Un shell de ce poste, sans session : il finit avec l'app, ou quand le chef y tape `exit`.
  function shellIci(projet: Projet, note: string): Tenu {
    const rang = rangNeuf(projet.nom);
    const tenu = tenir(projet, "shell", `shell ${rang}`);
    tenu.note = note;
    lancer(tenu, options.shell, [...argsDuShell], () => {
      tenu.arrete = true;
      tenus.delete(tenu.id);
    });
    return tenu;
  }

  // --- Les shells persistants.

  const rappel = (): Rappel => options.souvenirs?.lire() ?? {};

  // Un rang neuf dans le projet : ni celui d'un shell ouvert depuis le lancement, ni celui d'un
  // shell dont l'app se souvient — deux onglets n'ont pas le même titre, deux shells pas la même session.
  function rangNeuf(projet: string): number {
    const rang = Math.max(shellsOuverts.get(projet) ?? 0, rappel()[projet]?.dernier ?? 0) + 1;
    shellsOuverts.set(projet, rang);
    return rang;
  }

  function retenir(projet: string, souvenir: Souvenir): void {
    if (options.souvenirs === undefined) return;
    const tout = rappel();
    const avant = tout[projet] ?? { dernier: 0, shells: [] };
    tout[projet] = { dernier: Math.max(avant.dernier, souvenir.rang), shells: [...avant.shells.filter(({ rang }) => rang !== souvenir.rang), souvenir] };
    options.souvenirs.ecrire(tout);
  }

  function oublier(projet: string, rang: number): void {
    if (options.souvenirs === undefined) return;
    const tout = rappel();
    const avant = tout[projet];
    if (avant === undefined || !avant.shells.some((shell) => shell.rang === rang)) return;
    tout[projet] = { ...avant, shells: avant.shells.filter((shell) => shell.rang !== rang) };
    options.souvenirs.ecrire(tout);
  }

  const titreDe = (rang: number) => `shell ${rang}`;
  const ouEst = (dossier: string) => `${ICI}, in ${dossier}`;

  // Lance le shell dans sa session — la même commande la crée ou s'y rattache. Il finit quand sa
  // session finit (le chef y a tapé `exit`) : il quitte l'espace, et l'app l'oublie.
  function rattacher(projet: Projet, persistant: NonNullable<Tenu["persistant"]>, comment: string): Tenu {
    const { session } = persistant;
    const tenu = tenir(projet, "shell", titreDe(persistant.rang));
    tenu.persistant = persistant;
    tenu.ici = texteBandeau(session.cible, (options.compte ?? compteDe)(session.cible));
    tenu.bandeau = tenu.ici;
    tenu.note = `${comment} on ${ouEst(projet.dossier)} — session \`${session.nom}\`: closing the app only detaches from it, closing this shell destroys it`;
    attacher(tenu);
    return tenu;
  }

  function attacher(tenu: Tenu): void {
    const persistant = tenu.persistant;
    if (persistant === undefined) return;
    const { rang, session } = persistant;
    const { commande, args } = rattachement(session);
    lancer(tenu, commande, args, () => {
      tenu.arrete = true;
      tenus.delete(tenu.id);
      oublier(tenu.projet, rang);
    });
  }

  // Le pty d'un terminal s'arrête.
  function arreter(tenu: Tenu): void {
    tenu.saisie?.renoncer();
    tenu.pty?.tuer();
  }

  // Les shells dont l'app se souvient pour ce projet, rattachés à leur session, dans l'ordre de leurs rangs.
  function revenir(projet: Projet): void {
    const souvenus = [...(rappel()[projet.nom]?.shells ?? [])].sort((a, b) => a.rang - b.rang);
    for (const { rang, session, cible } of souvenus) if (persistantIci) rattacher(projet, { rang, session: { nom: session, cible } }, "persistent shell, reattached");
  }

  return {
    // Les terminaux d'un projet. Le premier appel lance son second, et ramène les shells
    // persistants que l'app avait à sa dernière fermeture ; les suivants les retrouvent tels qu'ils sont.
    espace(projet: Projet): Terminal[] {
      if (de(projet.nom).length === 0) {
        lancerSecond(tenir(projet, "second", TITRE_SECOND), true);
        revenir(projet);
      }
      return de(projet.nom).map(montre);
    },

    // Les pages que les seconds ont nommées pour obtenir un outil qui manque (#1435) : seules celles-là s'ouvrent
    // depuis leur colonne.
    pagesDesOutils(): Set<string> {
      return new Set([...tenus.values()].flatMap(({ empeche, manque }) => [...(empeche?.tools ?? []), ...(manque?.tools ?? [])].map(({ link }) => link)));
    },

    // Un shell persistant, sur la machine choisie : une session neuve, que l'app retient.
    ouvrir(projet: Projet, cible: Cible): Terminal {
      // Sans session sur ce poste (Windows) : un shell qui finit avec son terminal, sous le même bandeau qu'ailleurs.
      if (cible.lieu === "poste" && !persistantIci) {
        const tenu = shellIci(projet, `shell on ${ICI}, in ${projet.dossier} — ${SANS_SESSION}`);
        tenu.bandeau = texteBandeau(cible, (options.compte ?? compteDe)(cible));
        return montre(tenu);
      }
      const rang = rangNeuf(projet.nom);
      const session = { nom: nomDeSession(projet.nom, rang), cible };
      retenir(projet.nom, { rang, session: session.nom, cible });
      return montre(rattacher(projet, { rang, session }, "persistent shell"));
    },

    // Le chef ferme un shell : il quitte l'espace tout de suite, l'app l'oublie, et sa session est
    // détruite — il ne revient plus. Rend la raison, quand elle n'a pas pu l'être : elle reste alors
    // sur sa machine, et la raison dit laquelle. Le second ne se ferme pas ainsi.
    async fermerShell(id: number): Promise<{ ferme: true } | { refus: string }> {
      const tenu = tenus.get(id);
      if (tenu === undefined || tenu.genre !== "shell") return { refus: "nothing was closed: this shell is no longer open" };
      tenus.delete(id);
      tenu.arrete = true;
      arreter(tenu);
      options.surEtat(montre(tenu));
      if (tenu.persistant === undefined) return { ferme: true };
      const { rang, session } = tenu.persistant;
      oublier(tenu.projet, rang);
      const detruite = await detruire(session);
      if ("detruite" in detruite) return { ferme: true };
      return { refus: `${tenu.titre} is closed, but its session \`${session.nom}\` could not be destroyed on ${ICI}: it is no longer listed, and stays there until it is destroyed — ${detruite.erreur}` };
    },

    // `ecrit` : une commande à écrire dans ce shell, sans rien qui l'envoie — pour un
    // geste qui réclame un vrai terminal, ce que le `!` du second ne donne pas. Un shell
    // de connexion garde ce qui lui arrive avant son invite : la commande l'y attend.
    shell(projet: Projet, ecrit?: string): Terminal {
      const tenu = shellIci(projet, `shell on ${ICI}, in ${projet.dossier}`);
      if (ecrit !== undefined && CONTROLE.test(ecrit)) tenu.note = SANS_ECRIRE;
      else if (ecrit !== undefined) {
        tenu.pty?.ecrire(ecrit);
        tenu.note = `written into this shell, without Enter: \`${ecrit}\` — yours is what sends it. A real terminal: what the command asks for — a password — is typed here`;
      }
      return montre(tenu);
    },

    // Une session du second ouverte sur une commande de `claude` — `/brigade:init`,
    // pour amorcer le dépôt : une conversation neuve, pas le fil repris. Un second
    // qui tourne déjà n'est pas remplacé : la commande y est écrite, comme par un bouton.
    session(projet: Projet, commande: string): Terminal {
      const second = secondDe(projet);
      if (second.pty !== undefined || CONTROLE.test(commande)) return inscrire(projet, commande);
      second.titre = TITRE_AUTRE;
      second.note = `session launched on \`${commande}\`: \`claude ${commande}\`, a new conversation in this folder — it is not the second: it runs without the second's role`;
      lancer(second, options.claude, [commande], (code) => {
        second.arrete = true;
        second.note = arrete(code);
      });
      return montre(second);
    },

    ecrire(id: number, donnees: string): void {
      const tenu = tenus.get(id);
      if (tenu === undefined) return;
      if (tenu.pty !== undefined) {
        // Ce que le chef tape dans le second se compte : sa saisie n'est dite vide qu'après son Entrée.
        tenu.saisie?.frappe(donnees);
        tenu.pty.ecrire(donnees);
        // La demande est envoyée : son bandeau n'a plus de raison d'être.
        if (donnees === "\r" && tenu.demandeEcrite !== undefined) {
          delete tenu.demandeEcrite;
          tenu.note = "";
          options.surEtat(montre(tenu));
        }
      } else if (tenu.genre === "second") {
        lancerSecond(tenu, true);
        options.surEtat(montre(tenu));
      }
    },

    inscrire,

    envoyer,

    redimensionner(id: number, colonnes: number, lignes: number): void {
      const tenu = tenus.get(id);
      if (tenu === undefined) return;
      // Gardée même sans pty : un second relancé repart à la taille de sa vue.
      tenu.colonnes = colonnes;
      tenu.lignes = lignes;
      tenu.pty?.redimensionner(colonnes, lignes);
    },

    // Le projet a quitté la liste : ses terminaux sont arrêtés. Rend leurs numéros.
    quitter(projet: string): number[] {
      return de(projet).map((tenu) => {
        tenus.delete(tenu.id);
        arreter(tenu);
        return tenu.id;
      });
    },

    fermer(): void {
      ferme = true;
      for (const tenu of tenus.values()) arreter(tenu);
      tenus.clear();
    },
  };
}
