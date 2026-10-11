// La veille de la box : ce que l'app sait d'un projet, elle l'a lu en lançant
// à la place du chef les commandes qui existent, par `ssh`. Elle rend leur
// sortie mot pour mot — rien n'y est cherché, découpé ni redit — et n'ajoute
// qu'un fait, le sien : l'heure de la lecture. Quand elle n'atteint pas la box,
// elle rend ce qu'elle a obtenu, à la place de l'état : rien n'est gardé de la
// lecture d'avant.
import { execFile } from "node:child_process";
import type { Box, Projet } from "./config.ts";

// Ce qui est relayé, dans l'ordre où la vue le montre : `status` d'abord — sa
// tête dit ce qui attend le chef.
const COMMANDES = ["status", "grant"] as const;

export type Sortie = { commande: string; texte: string };
// `a` : l'instant où la lecture a fini. Une lecture a des sorties, ou une
// erreur — jamais les deux.
export type Lecture = { projet: string; a: string } & ({ sorties: Sortie[] } | { erreur: string });

export type Veille = ReturnType<typeof ouvrirVeille>;

export function ouvrirVeille(options: {
  ssh: string;
  // Entre la fin d'une lecture et le début de la suivante.
  intervalleMs: number;
  // Passé ce délai, un `ssh` qui n'a pas fini est arrêté.
  delaiMs: number;
  surLecture(lecture: Lecture): void;
}) {
  let tour: AbortController | undefined;
  let attente: NodeJS.Timeout | undefined;

  function lancer(box: Box, commande: string, signal: AbortSignal): Promise<Sortie> {
    // Sans terminal, `ssh` ne peut rien demander : il échoue plutôt que d'attendre un mot de passe.
    const args = ["-o", "BatchMode=yes", "--", box.hote, `${box.commande} run ${commande}`];
    return new Promise((resoudre, rejeter) => {
      execFile(options.ssh, args, { signal, timeout: options.delaiMs, maxBuffer: 16 * 1024 * 1024 }, (erreur, sortie, erreurs) => {
        if (erreur === null) return resoudre({ commande, texte: sortie });
        // Arrêté par le délai, il n'a pas de code — un autre arrêt en porte un, et se dit lui-même.
        const suite =
          erreur.killed && erreur.code === null
            ? `aucune réponse en ${(options.delaiMs / 1000).toLocaleString("fr-FR")} s : ssh arrêté`
            : typeof erreur.code === "number"
              ? `code de sortie ${erreur.code}`
              : erreur.message;
        rejeter(new Error(`$ ${options.ssh} ${args.join(" ")}\n${erreurs}${sortie}\n→ ${suite}`));
      });
    });
  }

  async function lire(projet: string, box: Box, signal: AbortSignal): Promise<void> {
    const lue = await Promise.all(COMMANDES.map((commande) => lancer(box, commande, signal))).then(
      (sorties) => ({ sorties }),
      (erreur: Error) => ({ erreur: erreur.message }),
    );
    // Le chef regarde ailleurs, ou l'app ferme : cette lecture n'est plus à personne.
    if (signal.aborted) return;
    options.surLecture({ projet, a: new Date().toISOString(), ...lue });
    attente = setTimeout(() => void lire(projet, box, signal), options.intervalleMs);
  }

  function arreter(): void {
    tour?.abort();
    clearTimeout(attente);
  }

  return {
    // Le projet dont l'espace est affiché : lui seul est lu, tout de suite, puis
    // à chaque intervalle. Un projet sans box, ou aucun projet, n'est pas lu.
    regarder(projet: Projet | undefined): void {
      arreter();
      if (projet?.box === undefined) return;
      tour = new AbortController();
      void lire(projet.nom, projet.box, tour.signal);
    },

    fermer: arreter,
  };
}
