// Les gestes de la file qu'un téléphone appairé fait sur un ticket, par le
// guichet de sa station (#1412) : merger la livraison, retirer le ticket du
// rail, le renvoyer en cuisine.
//
// Merger et retirer sont la commande de la box pour le même geste de la fiche
// — `rail merge <ticket>`, `rail remove <ticket>` —, et par le même
// chemin : le geste de la station (`station/geste.ts`), lancé depuis le
// dossier du runtime avec l'environnement de la station, comme `brigade
// <projet> …` le lance sur une box et l'app sur la station de son ordinateur.
// Le projet et la commande s'y jugent, la commande part avec l'environnement
// du projet, et son code de sortie est rendu tel quel. Seul celui qui le
// lance change : ce qu'un geste du téléphone change sur la station est ce que
// le même geste de l'ordinateur y aurait changé, et l'ordinateur le lit à sa
// lecture suivante.
//
// Le geste part dans son propre process, pas dans celui de la station : un
// merge attend GitHub, et la station continue de cuire pendant ce temps — ses
// appels à GitHub restent les siens.
//
// Le renvoyer en cuisine (« c'est arrivé », un ticket de WAITING ou revenu de
// WAITING) n'est pas une commande de la box : sur l'ordinateur, il part sur le
// tableau de la cuisine (`/brigade arrived #<ticket>`). Le téléphone joue
// l'action même que la box joue pour ce geste du tableau (attente.ts,
// `renvoyerEnCuisine`), dans ce process, sur le journal du projet : elle
// n'écrit que lui, sans attendre personne.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PRIX_DE_L_ARRIVEE, renvoyerEnCuisine } from "../attente.ts";
import { cheminJournal, ouvrirJournal, type Journal } from "../journal.ts";
import { journalPasRejoue } from "../journal-pas-rejoue.ts";
import { execFile } from "../sans-invite.ts";
import { CONFIGURATION, environnementDuProjet, lireFichierDeConfiguration } from "../station/configuration.ts";

// Le nom de chaque geste au guichet, et ce qui suit `brigade <projet>` pour le jouer — rien pour le renvoyer en
// cuisine, qui se joue ici.
export const GESTES = {
  merge: ["rail", "merge"],
  remove: ["rail", "remove"],
  "back-to-kitchen": null,
} as const satisfies Record<string, readonly [string, string] | null>;

export type GesteDuTelephone = keyof typeof GESTES;

export const estUnGeste = (nom: unknown): nom is GesteDuTelephone => typeof nom === "string" && Object.hasOwn(GESTES, nom);

// Ce qu'un geste a donné. `fait` : la commande l'a fait ; `refuse` : elle l'a
// refusé, ou n'a pu le faire — code 1, rien n'est changé sauf ce que sa
// phrase dit ; `inconnu` : la station n'a pas ce projet ; `en-echec` : la
// commande n'a pas rendu de verdict — elle n'est pas partie, n'a pas répondu
// à temps, ou est sortie sur un autre code. `said` : une phrase, ce que la
// commande en a dit, que le téléphone montre ; `detail` : ce qui a été lancé
// et tout ce qu'il a écrit.
export type RenduDuGeste = { etat: "fait" | "refuse" | "en-echec"; said: string; detail: string } | { etat: "inconnu" };

export type GestesDuTelephone = { jouer(projet: string, geste: GesteDuTelephone, ticket: number): Promise<RenduDuGeste> };

export type OptionsGestes = {
  // Le répertoire de la station (`BRIGADE_STATION_DIR`).
  racine: string;
  // L'environnement de la station : celui que le geste reçoit d'elle.
  env: Record<string, string | undefined>;
  // Passé ce délai, le geste est arrêté.
  delaiMs?: number;
};

export const DELAI_DU_GESTE_MS = 120_000;

// Le dossier du runtime, d'où le geste part : il y lit ses commandes (`package.json`).
const RUNTIME = join(import.meta.dirname, "..", "..");
const GESTE = join("src", "station", "geste.ts");

const PROJET_INCONNU = 65;

// La phrase d'une sortie : la première ligne que la commande dit en son nom
// (`brigade : …`), sans ce préfixe ; à défaut, sa première ligne.
function phraseDe(texte: string): string | null {
  const lignes = texte.split("\n").map((ligne) => ligne.trim()).filter(Boolean);
  const dite = lignes.find((ligne) => ligne.startsWith("brigade : "));
  return dite?.slice("brigade : ".length) ?? lignes[0] ?? null;
}

export function gestesDeLaStation(options: OptionsGestes): GestesDuTelephone {
  const { racine, env } = options;
  const delaiMs = options.delaiMs ?? DELAI_DU_GESTE_MS;
  return {
    jouer(projet, geste, ticket) {
      const lu = lireFichierDeConfiguration(join(racine, CONFIGURATION)).projets.find(({ nom }) => nom === projet);
      if (lu === undefined) return Promise.resolve({ etat: "inconnu" });
      const commande = GESTES[geste];
      if (commande === null) return Promise.resolve(arriver(environnementDuProjet(racine, lu, env).BRIGADE_STATE_DIR ?? "", projet, ticket));
      const args = [GESTE, projet, ...commande, String(ticket)];
      const lance = `$ ${["brigade", projet, ...commande, String(ticket)].join(" ")}`;
      return new Promise((resoudre) => {
        execFile(process.execPath, args, { cwd: RUNTIME, env: { ...env, BRIGADE_STATION_DIR: racine }, timeout: delaiMs, maxBuffer: 1024 * 1024, windowsHide: true }, (erreur, sortie, erreurs) => {
          const ecrit = `${erreurs}${sortie}`.trim();
          const detail = (suite: string) => [lance, ...(ecrit === "" ? [] : [ecrit]), `→ ${suite}`].join("\n");
          if (erreur === null) return resoudre({ etat: "fait", said: phraseDe(sortie) ?? `${geste} #${ticket}: done`, detail: detail("exit code 0") });
          if (erreur.killed === true) return resoudre({ etat: "en-echec", said: `the station did not answer within ${delaiMs / 1000} s and stopped the gesture — read the queue again to see whether it went through`, detail: detail("stopped") });
          if (erreur.code === PROJET_INCONNU) return resoudre({ etat: "inconnu" });
          if (typeof erreur.code !== "number") return resoudre({ etat: "en-echec", said: `the station could not run the gesture — ${erreur.message}`, detail: detail(erreur.message) });
          const said = phraseDe(erreurs) ?? phraseDe(sortie) ?? `the gesture ended with exit code ${erreur.code}`;
          return resoudre({ etat: erreur.code === 1 ? "refuse" : "en-echec", said, detail: detail(`exit code ${erreur.code}`) });
        });
      });
    },
  };
}

// Le renvoi en cuisine, joué sur le journal du projet comme la box le joue pour
// `/brigade arrived #<ticket>` : fait, refusé avec la raison de l'action, ou en
// échec — un journal que la station n'a pas, ou pas encore rejoué.
function arriver(repertoireEtat: string, projet: string, ticket: number): RenduDuGeste {
  const lance = `${projet}: /brigade arrived #${ticket}, played by the station on the project's log`;
  if (!existsSync(cheminJournal(repertoireEtat))) return { etat: "en-echec", said: `the kitchen of ${projet} has never started on this station: it has no log to write to`, detail: lance };
  let journal: Journal | undefined;
  try {
    journal = ouvrirJournal(repertoireEtat);
    const rendu = renvoyerEnCuisine(journal, projet, ticket);
    if (rendu.done) return { etat: "fait", said: `#${ticket}: it arrived — it goes back to the kitchen`, detail: `${lance}\n→ cost: ${PRIX_DE_L_ARRIVEE}` };
    return { etat: "refuse", said: rendu.reason, detail: `${lance}\n→ refused: ${rendu.reason}` };
  } catch (erreur) {
    const motif = journalPasRejoue(erreur) ? "this log does not have the rail state yet: restart the runtime, which recomputes it" : erreur instanceof Error ? erreur.message : String(erreur);
    return { etat: "en-echec", said: `the station could not play the gesture — ${motif}`, detail: `${lance}\n→ ${motif}` };
  } finally {
    journal?.fermer();
  }
}
