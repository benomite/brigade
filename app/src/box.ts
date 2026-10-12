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
export type Echec = { erreur: string; atteinte: boolean; cas: Cas | null };
// `demande` : celle à laquelle la lecture répond, telle que `regarder` l'a reçue.
// `a` : l'instant où la lecture a fini. Une lecture a des sorties, ou une
// erreur — jamais les deux.
export type Lecture = { projet: string; demande: number; a: string } & ({ sorties: Sortie[] } | Echec);

// Un projet qui a une box : son nom est celui que le geste reçoit.
type Servi = { nom: string; box: Box };

export type Veille = ReturnType<typeof ouvrirVeille>;

// Les codes qui disent un cas. 255 est à `ssh` ; 65, 68, 69 et 70 sont des refus du
// geste (docs/runtime.md, « Piloter ») ; 127 est celui du shell de la box, qui
// n'a pas trouvé la commande.
const CAS: Readonly<Record<number, Cas>> = { 255: "ssh-en-echec", 65: "projet-inconnu", 68: "sans-droit", 69: "commande-manque", 70: "node-inapte", 127: "commande-manque" };

// Le nom tel que le shell de la box le rendra au geste : en un seul argument,
// sans rien en exécuter. Un nom que le geste accepte part tel quel.
export const cite = (nom: string) => (/^[a-z0-9-]+$/.test(nom) ? nom : `'${nom.replaceAll("'", `'\\''`)}'`);

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
  surLecture(lecture: Lecture): void;
}) {
  let tour: AbortController | undefined;
  const passage = options.passage ?? new Map<string, Promise<unknown>>();

  // Chacune attend que la précédente du même projet ait fini, de quelque veille qu'elle soit.
  function lancer(servi: Servi, commande: string, signal: AbortSignal): Promise<Sortie | Echec> {
    const rendu = (passage.get(servi.nom) ?? Promise.resolve()).then(() => joindre(servi, commande, signal));
    passage.set(servi.nom, rendu);
    return rendu;
  }

  function joindre({ nom, box }: Servi, commande: string, signal: AbortSignal): Promise<Sortie | Echec> {
    // Sans terminal, `ssh` ne peut rien demander : il échoue plutôt que d'attendre un mot de passe.
    const args = ["-o", "BatchMode=yes", "-o", `ConnectTimeout=${options.connexionS}`, "--", box.hote, `brigade ${cite(nom)} ${commande}`];
    return new Promise((resoudre) => {
      execFile(options.ssh, args, { signal, timeout: options.delaiMs, maxBuffer: 16 * 1024 * 1024 }, (erreur, sortie, erreurs) => {
        if (erreur === null) return resoudre({ commande, texte: sortie });
        // Arrêté par le délai, un `ssh` connecté attrape le signal et sort de lui-même en 255.
        // Avant la session — un agent qui attend une confirmation — il en meurt, sans code :
        // rien ne dit alors s'il avait joint la box. Un autre arrêt se dit lui-même.
        const connecte = erreur.code === 255;
        const suite =
          erreur.killed === true
            ? `aucune réponse en ${(options.delaiMs / 1000).toLocaleString("fr-FR")} s : ssh arrêté${connecte ? "" : ", sans avoir dit s'il avait joint la box"}`
            : typeof erreur.code === "number"
              ? `code de sortie ${erreur.code}`
              : erreur.message;
        resoudre({
          erreur: `$ ${options.ssh} ${args.join(" ")}\n${erreurs}${sortie}\n→ ${suite}`,
          // 255 est le code de `ssh` : celui d'une box pas jointe, sauf quand c'est le délai qui
          // l'a fait sortir. Tout autre code vient de la box — et une sortie trop longue aussi.
          atteinte: connecte ? erreur.killed === true : typeof erreur.code === "number" || erreur.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
          // Arrêté, `ssh` n'a rien dit de lui-même : son code est celui du délai.
          cas: (erreur.killed !== true && typeof erreur.code === "number" && CAS[erreur.code]) || null,
        });
      });
    });
  }

  // Les commandes partent l'une après l'autre, et la première qui échoue est
  // l'erreur : un projet n'ouvre qu'une connexion à la fois, pour que tous les
  // projets d'une même box, lus de front, n'y soient pas refusés pour leur nombre.
  async function lire(servi: Servi, commandes: readonly string[], signal: AbortSignal): Promise<{ sorties: Sortie[] } | Echec> {
    const sorties: Sortie[] = [];
    for (const commande of commandes) {
      const rendu = await lancer(servi, commande, signal);
      if ("erreur" in rendu) return rendu;
      sorties.push(rendu);
    }
    return { sorties };
  }

  // Un projet : lu tout de suite, puis à chaque intervalle, sans rien attendre des autres.
  async function suivre(servi: Servi, commandes: readonly string[], demande: number, signal: AbortSignal): Promise<void> {
    for (;;) {
      const lue = await lire(servi, commandes, signal);
      // Le chef regarde ailleurs, ou l'app ferme : cette lecture n'est plus à personne.
      if (signal.aborted) return;
      options.surLecture({ projet: servi.nom, demande, a: new Date().toISOString(), ...lue });
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
    // projet sans box ne l'est pas. Chaque lecture porte la `demande` : celle
    // d'un écran quitté peut encore être en route quand la vue en montre un autre.
    regarder(projets: readonly Projet[], commandes: readonly string[], demande: number): void {
      arreter();
      const { signal } = (tour = new AbortController());
      for (const { nom, box } of projets) if (box !== undefined) void suivre({ nom, box }, commandes, demande, signal);
    },

    fermer: arreter,
  };
}
