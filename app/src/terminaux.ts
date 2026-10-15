// Le registre des terminaux : un second par projet, et les shells ouverts à
// côté. Il vit dans le process principal — aucune vue ne tient un pty : changer
// d'espace, ou d'onglet, ne peut donc rien interrompre.
//
// Un shell que le chef ouvre par « + shell » est persistant (persistance.ts) : il vit dans une
// session, sur la machine choisie (machines.ts), et l'app s'en souvient (souvenirs.ts). Fermer
// l'app ne fait que s'en détacher : à la réouverture, il revient dans l'espace de son projet,
// rattaché à sa session. Seule sa fermeture par le chef la détruit. Le shell qu'un geste ouvre
// pour y écrire sa commande, lui, est un shell de ce poste qui finit avec l'app.
import { compteDe, texteBandeau } from "./bandeau.ts";
import type { Projet } from "./config.ts";
import { lieuDe } from "./machines.ts";
import { detruire as detruireSession, nomDeSession, rattachement, type Cible, type Session } from "./persistance.ts";
import { PREUVE, reglages, suivreSaisie, type Saisie, type Tours } from "./saisie.ts";
import type { Rappel, Souvenir, Souvenirs } from "./souvenirs.ts";

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
};

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
};

export type Terminaux = ReturnType<typeof ouvrirTerminaux>;

// `saisie` : ce que l'app sait de la saisie d'un second qui tourne (saisie.ts).
// `persistant` : la session d'un shell persistant, et son rang dans le projet.
type Tenu = Terminal & { dossier: string; colonnes: number; lignes: number; pty?: Pty; saisie?: Saisie; persistant?: { rang: number; session: Session } };

// Ce qui ne s'écrit jamais dans un terminal à la place du chef : un retour à la
// ligne enverrait la commande, et tout autre caractère de contrôle y est une touche.
// Qui prépare une commande (gestes.ts) la refuse par la même règle, avant d'ouvrir un shell.
export const CONTROLE = /[\x00-\x1f\x7f]/;
export const SANS_ECRIRE = "nothing is written: the command carries a control character, and a line break would have sent it — check “nom” and “hote” of this project in the projects file";

export function ouvrirTerminaux(options: {
  ouvrirPty(lancement: Lancement): Pty;
  claude: string;
  shell: string;
  surSortie(id: number, donnees: string): void;
  // Un terminal a changé : sa note, ou il s'est arrêté.
  surEtat(terminal: Terminal): void;
  // Le fichier où ce second dira ses tours (saisie.ts). Sans lui, aucun second n'est jamais dit libre : aucun geste direct ne part.
  tours?(id: number): Tours;
  // Ce que l'app laisse à `claude` pour se montrer en mode shell avant qu'elle renonce à son Entrée : une garde, large.
  delaiPreuveMs?: number;
  // Ce que l'app se rappelle des shells persistants. Sans lui, aucun ne revient à la réouverture.
  souvenirs?: Souvenirs;
  // Le `ssh` qui joint une machine distante — jamais posé hors des essais.
  ssh?: string;
  // Le compte qu'une machine donne au chef, pour le bandeau d'un shell. Par défaut : celui de ce
  // poste, ou celui que `ssh -G` résout pour l'hôte.
  compte?(cible: Cible): string;
  // Détruit la session d'un shell fermé pour de bon (persistance.ts).
  detruire?(session: Session): Promise<{ detruite: true } | { erreur: string }>;
}) {
  const tenus = new Map<number, Tenu>();
  // Un shell fermé ne rend pas son numéro : deux onglets ne portent jamais le même titre.
  const shellsOuverts = new Map<string, number>();
  let dernier = 0;
  let ferme = false;

  const detruire = options.detruire ?? ((session: Session) => detruireSession(session, options.ssh === undefined ? {} : { ssh: options.ssh }));

  const montre = ({ id, projet, genre, titre, note, arrete, bandeau }: Tenu): Terminal => ({ id, projet, genre, titre, note, arrete, ...(bandeau === undefined ? {} : { bandeau }) });
  const de = (projet: string) => [...tenus.values()].filter((tenu) => tenu.projet === projet);

  function tenir(projet: Projet, genre: Terminal["genre"], titre: string): Tenu {
    const tenu: Tenu = { id: ++dernier, projet: projet.nom, genre, titre, note: "", arrete: false, dossier: projet.dossier, colonnes: 80, lignes: 24 };
    tenus.set(tenu.id, tenu);
    return tenu;
  }

  function lancer(tenu: Tenu, commande: string, args: string[], surFin: (code: number) => void): void {
    tenu.arrete = false;
    // Un second dit ses tours à l'app par ses crochets, dans un fichier qui repart vide avec lui —
    // les réglages suivent ce qui est lancé : le rôle reste le premier mot que `claude` reçoit.
    const tours = tenu.genre === "second" ? options.tours?.(tenu.id) : undefined;
    tours?.vider();
    const saisie = tenu.genre === "second" ? suivreSaisie(() => tours?.lire() ?? "") : undefined;
    tenu.saisie = saisie;
    tenu.pty = options.ouvrirPty({
      commande,
      args: tours === undefined ? args : [...args, "--settings", reglages(tours.chemin)],
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
        if (ferme || tenus.get(tenu.id) !== tenu) return;
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

  // Le rôle du second, invoqué au démarrage : c'est lui qui lit la file du projet
  // à l'ouverture. Sans cela l'onglet ne serait qu'un `claude` nu qui s'appelle Second.
  const ROLE = "/brigade:po";
  // Un onglet nommé Second est un onglet où le rôle est établi.
  const TITRE_SECOND = "Second";
  // Une session ouverte sur une autre commande (`/brigade:init`) n'est pas le second : l'onglet ne le prétend pas.
  const TITRE_AUTRE = "Claude";

  // Le second reprend le fil de ce dossier si `claude` en a un, et y invoque le
  // rôle. Ce fil est la dernière conversation du dossier, pas forcément celle
  // d'un second : la note le dit. Il n'y en a pas — ou `claude` n'a pas su le
  // reprendre — quand `claude --continue` sort en erreur : une session neuve
  // part alors, une seule fois, sur le rôle, et sa note le dit.
  function lancerSecond(tenu: Tenu, reprise: boolean): void {
    tenu.titre = TITRE_SECOND;
    if (reprise) tenu.note = `thread resumed: \`claude --continue\`, the latest conversation in this folder — whichever it is, not necessarily a second's; \`${ROLE}\` is invoked in it`;
    else tenu.note = `new session: \`claude ${ROLE}\``;
    lancer(tenu, options.claude, reprise ? ["--continue", ROLE] : [ROLE], (code) => {
      if (reprise && code !== 0) {
        lancerSecond(tenu, false);
        tenu.note = `new session: \`claude --continue\` exited with code ${code}, the thread was not resumed — \`claude ${ROLE}\``;
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
  // (demande.ts) — le risque d'un écran qui prend le texte pour des touches reste dit.
  function inscrire(projet: Projet, commande: string, dit?: string): Terminal {
    const second = secondDe(projet);
    if (CONTROLE.test(commande)) {
      second.note = SANS_ECRIRE;
      if (second.pty === undefined) second.arrete = true;
    } else if (second.pty === undefined) {
      lancerSecond(second, true);
      second.note = `the second was not running: launched (\`claude --continue ${ROLE}\`) — the command is not written into a second that is starting, click again when it is ready`;
    } else {
      second.pty.ecrire(commande);
      // La saisie n'est plus vide : un geste direct ne s'y écrira pas à la suite.
      second.saisie?.entamer();
      second.note = dit ?? `written into the second, without Enter: \`${commande}\` — at \`claude\`'s prompt, it waits for yours, after your typing if you were typing. On any other screen (a choice to make, vim mode), these characters are keystrokes: look at the second before confirming`;
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
    const { pty, saisie } = second;
    if (pty === undefined || saisie === undefined) {
      lancerSecond(second, true);
      second.note = `the second was not running: launched (\`claude --continue ${ROLE}\`) — the command did not go: a second that is starting takes nothing, click again when it has finished its first turn`;
      return Promise.resolve(montre(second));
    }
    const etat = saisie.etat();
    if (!etat.libre) return Promise.resolve({ refus: `${etat.dit} — the command did not go, and nothing is written: \`${commande}\`` });
    return new Promise((rendre) => {
      const garde = setTimeout(saisie.renoncer, options.delaiPreuveMs ?? 5_000);
      saisie.ecrit((preuve) => {
        clearTimeout(garde);
        // Le second arrêté entre-temps a sa propre note, et plus de saisie.
        if (second.pty !== pty) return rendre(montre(second));
        if (preuve) {
          pty.ecrire("\r");
          saisie.parti();
          second.note = `sent to the second: \`${commande}\` — \`claude\` went into shell mode, the app pressed Enter. Its output is read in its thread, and the second reads it too`;
        } else {
          second.note = `written into the second, but not sent: \`${commande}\` — \`claude\` did not show itself in shell mode (“${PREUVE}”), so the app did not press Enter. Its input was not empty, or it was showing something other than its prompt: look at the second, and erase what is written there`;
        }
        rendre(montre(second));
      });
      pty.ecrire(commande);
    });
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

  const titreDe = (rang: number, cible: Cible) => (cible.lieu === "poste" ? `shell ${rang}` : `shell ${rang} · ${cible.nom}`);
  const ouEst = (cible: Cible, dossier: string) => (cible.lieu === "poste" ? `this Mac, in ${dossier}` : `${lieuDe(cible)} (\`ssh ${cible.hote}\`, with the account your ssh gives it)`);

  // Lance le shell dans sa session — la même commande la crée ou s'y rattache. Il finit quand sa
  // session finit (le chef y a tapé `exit`) : il quitte l'espace, et l'app l'oublie. Sauf quand
  // c'est `ssh` qui a lâché (255) : la session tient sans doute toujours, là-bas — l'app s'en
  // souvient, et le shell reviendra à la prochaine ouverture.
  function rattacher(projet: Projet, persistant: NonNullable<Tenu["persistant"]>, comment: string): Tenu {
    const { rang, session } = persistant;
    const tenu = tenir(projet, "shell", titreDe(rang, session.cible));
    tenu.persistant = persistant;
    tenu.bandeau = texteBandeau(session.cible, (options.compte ?? ((cible) => compteDe(cible, options.ssh)))(session.cible));
    tenu.note = `${comment} on ${ouEst(session.cible, projet.dossier)} — session \`${session.nom}\`: closing the app only detaches from it, closing this shell destroys it`;
    const { commande, args } = rattachement(session, options.ssh);
    lancer(tenu, commande, args, (code) => {
      tenu.arrete = true;
      tenus.delete(tenu.id);
      if (session.cible.lieu === "poste" || code !== 255) oublier(projet.nom, rang);
    });
    return tenu;
  }

  // Les shells dont l'app se souvient pour ce projet, rattachés à leur session, dans l'ordre de leurs rangs.
  function revenir(projet: Projet): void {
    const souvenus = [...(rappel()[projet.nom]?.shells ?? [])].sort((a, b) => a.rang - b.rang);
    for (const { rang, session, cible } of souvenus) rattacher(projet, { rang, session: { nom: session, cible } }, "persistent shell, reattached");
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

    // Un shell persistant, sur la machine choisie : une session neuve, que l'app retient.
    ouvrir(projet: Projet, cible: Cible): Terminal {
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
      tenu.pty?.tuer();
      options.surEtat(montre(tenu));
      if (tenu.persistant === undefined) return { ferme: true };
      const { rang, session } = tenu.persistant;
      oublier(tenu.projet, rang);
      const detruite = await detruire(session);
      if ("detruite" in detruite) return { ferme: true };
      return { refus: `${tenu.titre} is closed, but its session \`${session.nom}\` could not be destroyed on ${lieuDe(session.cible)}: it is no longer listed, and stays there until it is destroyed — ${detruite.erreur}` };
    },

    // `ecrit` : une commande à écrire dans ce shell, sans rien qui l'envoie — pour un
    // geste qui réclame un vrai terminal, ce que le `!` du second ne donne pas. Un shell
    // de connexion garde ce qui lui arrive avant son invite : la commande l'y attend.
    shell(projet: Projet, ecrit?: string): Terminal {
      const rang = rangNeuf(projet.nom);
      const tenu = tenir(projet, "shell", `shell ${rang}`);
      tenu.note = `shell on this Mac, in ${projet.dossier}`;
      lancer(tenu, options.shell, ["-l"], () => {
        tenu.arrete = true;
        tenus.delete(tenu.id);
      });
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
      second.note = `session launched on \`${commande}\`: \`claude ${commande}\`, a new conversation in this folder — it is not the second: \`${ROLE}\` is not invoked in it`;
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
        tenu.saisie?.renoncer();
        tenu.pty?.tuer();
        return tenu.id;
      });
    },

    fermer(): void {
      ferme = true;
      for (const tenu of tenus.values()) {
        tenu.saisie?.renoncer();
        tenu.pty?.tuer();
      }
      tenus.clear();
    },
  };
}
