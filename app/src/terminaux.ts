// Le registre des terminaux : un second par projet, et les shells ouverts à
// côté. Il vit dans le process principal — aucune vue ne tient un pty : changer
// d'espace, ou d'onglet, ne peut donc rien interrompre.
import type { Projet } from "./config.ts";

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
};

export type Terminaux = ReturnType<typeof ouvrirTerminaux>;

type Tenu = Terminal & { dossier: string; colonnes: number; lignes: number; pty?: Pty };

// Ce qui ne s'écrit jamais dans un terminal à la place du chef : un retour à la
// ligne enverrait la commande, et tout autre caractère de contrôle y est une touche.
// Qui prépare une commande (gestes.ts) la refuse par la même règle, avant d'ouvrir un shell.
export const CONTROLE = /[\x00-\x1f\x7f]/;
export const SANS_ECRIRE = "rien n'est écrit : la commande porte un caractère de contrôle, et un retour à la ligne l'aurait envoyée — vérifie « nom » et « hote » de ce projet dans le fichier des projets";

export function ouvrirTerminaux(options: {
  ouvrirPty(lancement: Lancement): Pty;
  claude: string;
  shell: string;
  surSortie(id: number, donnees: string): void;
  // Un terminal a changé : sa note, ou il s'est arrêté.
  surEtat(terminal: Terminal): void;
}) {
  const tenus = new Map<number, Tenu>();
  // Un shell fermé ne rend pas son numéro : deux onglets ne portent jamais le même titre.
  const shellsOuverts = new Map<string, number>();
  let dernier = 0;
  let ferme = false;

  const montre = ({ id, projet, genre, titre, note, arrete }: Tenu): Terminal => ({ id, projet, genre, titre, note, arrete });
  const de = (projet: string) => [...tenus.values()].filter((tenu) => tenu.projet === projet);

  function tenir(projet: Projet, genre: Terminal["genre"], titre: string): Tenu {
    const tenu: Tenu = { id: ++dernier, projet: projet.nom, genre, titre, note: "", arrete: false, dossier: projet.dossier, colonnes: 80, lignes: 24 };
    tenus.set(tenu.id, tenu);
    return tenu;
  }

  function lancer(tenu: Tenu, commande: string, args: string[], surFin: (code: number) => void): void {
    tenu.arrete = false;
    tenu.pty = options.ouvrirPty({
      commande,
      args,
      dossier: tenu.dossier,
      colonnes: tenu.colonnes,
      lignes: tenu.lignes,
      surSortie: (donnees) => options.surSortie(tenu.id, donnees),
      surFin: (code) => {
        // À la fermeture de l'app, tout meurt : il n'y a plus rien à dire, ni à relancer.
        // Pareil pour un terminal dont le projet a quitté la liste.
        if (ferme || tenus.get(tenu.id) !== tenu) return;
        tenu.pty = undefined;
        surFin(code);
        options.surEtat(montre(tenu));
      },
    });
  }

  const secondDe = (projet: Projet) => de(projet.nom).find(({ genre }) => genre === "second") ?? tenir(projet, "second", "Second");
  const arrete = (code: number) => `le second s'est arrêté (code ${code}) — une touche le relance`;

  // Le second reprend le fil de ce dossier si `claude` en a un. Il n'en a pas —
  // ou il n'a pas su le reprendre — quand `claude --continue` sort en erreur :
  // une session neuve part alors, une seule fois, et sa note le dit.
  function lancerSecond(tenu: Tenu, reprise: boolean): void {
    if (reprise) tenu.note = "fil repris : `claude --continue`, la dernière conversation de ce dossier";
    lancer(tenu, options.claude, reprise ? ["--continue"] : [], (code) => {
      if (reprise && code !== 0) {
        tenu.note = `session neuve : \`claude --continue\` est sorti en code ${code}, le fil n'a pas été repris`;
        lancerSecond(tenu, false);
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
  function inscrire(projet: Projet, commande: string): Terminal {
    const second = secondDe(projet);
    if (CONTROLE.test(commande)) {
      second.note = SANS_ECRIRE;
      if (second.pty === undefined) second.arrete = true;
    } else if (second.pty === undefined) {
      lancerSecond(second, true);
      second.note = "le second ne tournait pas : lancé (`claude --continue`) — la commande n'est pas écrite dans un second qui démarre, reclique quand il est prêt";
    } else {
      second.pty.ecrire(commande);
      second.note = `écrit dans le second, sans Entrée : \`${commande}\` — devant l'invite de \`claude\`, elle attend la tienne, à la suite de ta frappe si tu tapais. Devant un autre écran (un choix à faire, le mode vim), ces caractères sont des touches : regarde le second avant de valider`;
    }
    return montre(second);
  }

  return {
    // Les terminaux d'un projet. Le premier appel lance son second ; les
    // suivants le retrouvent tel qu'il est, avec ses shells.
    espace(projet: Projet): Terminal[] {
      if (de(projet.nom).length === 0) lancerSecond(tenir(projet, "second", "Second"), true);
      return de(projet.nom).map(montre);
    },

    // `ecrit` : une commande à écrire dans ce shell, sans rien qui l'envoie — pour un
    // geste qui réclame un vrai terminal, ce que le `!` du second ne donne pas. Un shell
    // de connexion garde ce qui lui arrive avant son invite : la commande l'y attend.
    shell(projet: Projet, ecrit?: string): Terminal {
      const rang = (shellsOuverts.get(projet.nom) ?? 0) + 1;
      shellsOuverts.set(projet.nom, rang);
      const tenu = tenir(projet, "shell", `shell ${rang}`);
      tenu.note = `shell sur ce Mac, dans ${projet.dossier}`;
      lancer(tenu, options.shell, ["-l"], () => {
        tenu.arrete = true;
        tenus.delete(tenu.id);
      });
      if (ecrit !== undefined && CONTROLE.test(ecrit)) tenu.note = SANS_ECRIRE;
      else if (ecrit !== undefined) {
        tenu.pty?.ecrire(ecrit);
        tenu.note = `écrit dans ce shell, sans Entrée : \`${ecrit}\` — c'est la tienne qui l'envoie. Un vrai terminal : ce que la commande demande — un mot de passe — se tape ici`;
      }
      return montre(tenu);
    },

    // Une session du second ouverte sur une commande de `claude` — `/brigade:init`,
    // pour amorcer le dépôt : une conversation neuve, pas le fil repris. Un second
    // qui tourne déjà n'est pas remplacé : la commande y est écrite, comme par un bouton.
    session(projet: Projet, commande: string): Terminal {
      const second = secondDe(projet);
      if (second.pty !== undefined || CONTROLE.test(commande)) return inscrire(projet, commande);
      second.note = `session lancée sur \`${commande}\` : \`claude ${commande}\`, une conversation neuve dans ce dossier`;
      lancer(second, options.claude, [commande], (code) => {
        second.arrete = true;
        second.note = arrete(code);
      });
      return montre(second);
    },

    ecrire(id: number, donnees: string): void {
      const tenu = tenus.get(id);
      if (tenu === undefined) return;
      if (tenu.pty !== undefined) tenu.pty.ecrire(donnees);
      else if (tenu.genre === "second") {
        lancerSecond(tenu, true);
        options.surEtat(montre(tenu));
      }
    },

    inscrire,

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
        tenu.pty?.tuer();
        return tenu.id;
      });
    },

    fermer(): void {
      ferme = true;
      for (const tenu of tenus.values()) tenu.pty?.tuer();
      tenus.clear();
    },
  };
}
