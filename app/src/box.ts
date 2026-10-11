// La veille des box : ce que l'app sait d'un projet, elle l'a lu en lançant
// à la place du chef les commandes qui existent, par `ssh`. Elle rend leur
// sortie mot pour mot — rien n'y est cherché, découpé ni redit — et n'ajoute
// que deux faits, les siens : l'heure de la lecture et, quand elle a échoué,
// si c'est la box qui n'a pas été atteinte ou la commande qui n'a pas répondu.
// Elle rend alors ce qu'elle a obtenu, à la place de l'état : rien n'est gardé
// de la lecture d'avant.
import { execFile } from "node:child_process";
import { setTimeout as attendre } from "node:timers/promises";
import type { Box, Projet } from "./config.ts";

export type Sortie = { commande: string; texte: string };
// `atteinte` : `ssh` a joint la box, et c'est la commande qui a échoué, ou qui
// n'a rien rendu. Fausse : c'est `ssh` lui-même qui a échoué (code 255), ou qui
// n'a pas pu être lancé.
export type Echec = { erreur: string; atteinte: boolean };
// `a` : l'instant où la lecture a fini. Une lecture a des sorties, ou une
// erreur — jamais les deux.
export type Lecture = { projet: string; a: string } & ({ sorties: Sortie[] } | Echec);

export type Veille = ReturnType<typeof ouvrirVeille>;

export function ouvrirVeille(options: {
  ssh: string;
  // Entre la fin d'une lecture et le début de la suivante.
  intervalleMs: number;
  // Passé ce délai, un `ssh` qui n'a pas fini est arrêté.
  delaiMs: number;
  // Ce que `ssh` s'accorde pour joindre la box, en secondes — moins que le
  // délai : une box muette, c'est lui qui le dit, avec ses mots et son code.
  // Un `ssh` encore là au délai avait donc joint la sienne.
  connexionS: number;
  surLecture(lecture: Lecture): void;
}) {
  let tour: AbortController | undefined;

  function lancer(box: Box, commande: string, signal: AbortSignal): Promise<Sortie | Echec> {
    // Sans terminal, `ssh` ne peut rien demander : il échoue plutôt que d'attendre un mot de passe.
    const args = ["-o", "BatchMode=yes", "-o", `ConnectTimeout=${options.connexionS}`, "--", box.hote, `${box.commande} run ${commande}`];
    return new Promise((resoudre) => {
      execFile(options.ssh, args, { signal, timeout: options.delaiMs, maxBuffer: 16 * 1024 * 1024 }, (erreur, sortie, erreurs) => {
        if (erreur === null) return resoudre({ commande, texte: sortie });
        // Arrêté par le délai, `ssh` meurt du signal, sans code — ou, déjà connecté, l'attrape
        // et sort de lui-même en 255. Un autre arrêt porte un code qui n'est pas un nombre, et se dit lui-même.
        const delai = erreur.killed === true && typeof erreur.code !== "string";
        const suite = delai
          ? `aucune réponse en ${(options.delaiMs / 1000).toLocaleString("fr-FR")} s : ssh arrêté`
          : typeof erreur.code === "number"
            ? `code de sortie ${erreur.code}`
            : erreur.message;
        resoudre({
          erreur: `$ ${options.ssh} ${args.join(" ")}\n${erreurs}${sortie}\n→ ${suite}`,
          // Un `ssh` qu'il a fallu arrêter — délai, ou sortie trop longue — était connecté.
          atteinte: erreur.killed === true || (typeof erreur.code === "number" && erreur.code !== 255),
        });
      });
    });
  }

  // Les commandes partent l'une après l'autre, et la première qui échoue est
  // l'erreur : un projet n'ouvre qu'une connexion à la fois, pour que tous les
  // projets d'une même box, lus de front, n'y soient pas refusés pour leur nombre.
  async function lire(box: Box, commandes: readonly string[], signal: AbortSignal): Promise<{ sorties: Sortie[] } | Echec> {
    const sorties: Sortie[] = [];
    for (const commande of commandes) {
      const rendu = await lancer(box, commande, signal);
      if ("erreur" in rendu) return rendu;
      sorties.push(rendu);
    }
    return { sorties };
  }

  // Un projet : lu tout de suite, puis à chaque intervalle, sans rien attendre des autres.
  async function suivre(projet: string, box: Box, commandes: readonly string[], signal: AbortSignal): Promise<void> {
    for (;;) {
      const lue = await lire(box, commandes, signal);
      // Le chef regarde ailleurs, ou l'app ferme : cette lecture n'est plus à personne.
      if (signal.aborted) return;
      options.surLecture({ projet, a: new Date().toISOString(), ...lue });
      await attendre(options.intervalleMs, undefined, { signal }).catch(() => {});
      if (signal.aborted) return;
    }
  }

  function arreter(): void {
    tour?.abort();
  }

  return {
    // Ce qui est affiché — un projet, ou tous dans la kitchen — et les commandes
    // à y lancer, dans l'ordre où la vue les montre. Rien d'autre n'est lu ; un
    // projet sans box ne l'est pas.
    regarder(projets: readonly Projet[], commandes: readonly string[]): void {
      arreter();
      const { signal } = (tour = new AbortController());
      for (const { nom, box } of projets) if (box !== undefined) void suivre(nom, box, commandes, signal);
    },

    fermer: arreter,
  };
}
