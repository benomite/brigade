// Le mot au cook dans le cycle du cook (#4047) : le lancement d'un cook de
// ticket est un tour. Le mot que le chef envoie pendant ce tour attend sa fin ;
// le cook n'est jamais coupé au milieu d'une édition. À la fin du tour, les mots
// en file lui sont remis : s'il a fini son tour sans arrêt, sa session reprend
// (`claude --resume`) sur un tour de plus, dont l'entrée porte le mot ; sinon
// le mot attend l'entrée de son lancement suivant (une relance, un renvoi).
//
// Seul le cook de `claude` a des tours qui se reprennent : ses arguments
// finissent par `--disallowedTools` (`argumentsClaude`, claude.ts). Le
// reviewer, la pass et un cook sous Codex se lancent tels quels.
//
// Un tour de plus qui ne finit pas ne coûte rien à la livraison : elle part
// telle que le tour d'avant l'a laissée, comme pour la relance des mutations.
import { readFileSync } from "node:fs";
import type { Lancer } from "../brigade-github.ts";
import { sessionDuFlux } from "../reprise-de-session.ts";
import type { Fin } from "../superviseur.ts";
import { fileSurDisque } from "./file.ts";
import { creerMotAuCook, surUneLigne, type MotAuCook } from "./mot-au-cook.ts";

// L'argument qui clôt ceux d'un cook de `claude`.
const FIN_DES_ARGUMENTS = "--disallowedTools";

// L'entrée du tour qui reprend la session pour un mot du chef, en français
// comme toute consigne du cook ; les mots s'y ajoutent (`entreeDuTour`).
export const ENTREE_DE_LA_REPRISE =
  "Ton tour est fini, et le chef t'a envoyé un mot pendant ce tour. Tiens-en compte, puis termine comme ta consigne le demande : ton dernier message porte ton compte-rendu entier, avec ton livrable — c'est lui que la station lit.";

// Les arguments du cook, sa session reprise : une reprise d'avant (celle d'un
// renvoi, bifurquée) cède la place à celle-ci.
export function avecReprise(args: readonly string[], session: string): string[] {
  const sans: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--resume") i += 1;
    else if (args[i] !== "--fork-session") sans.push(args[i] as string);
  }
  const fin = sans.lastIndexOf(FIN_DES_ARGUMENTS);
  return [...sans.slice(0, fin), "--resume", session, ...sans.slice(fin)];
}

// Le flux du tour de plus : à côté de celui du cook.
export const fluxDeLaReprise = (flux: string, reprise: number) => `${flux.replace(/\.flux\.jsonl$/, "")}-word-${reprise}.flux.jsonl`;

const sessionLue = (flux: string): string | null => {
  try {
    return sessionDuFlux(readFileSync(flux, "utf8"));
  } catch {
    return null;
  }
};

const fini = (fin: Fin) => fin.code === 0 && fin.arret === null;
const message = (erreur: unknown) => surUneLigne(erreur instanceof Error ? erreur.message : String(erreur));

// `lancer`, avec les tours du cook bornés par le mot au cook `mot`.
export function avecLesMots(lancer: Lancer, mot: MotAuCook, avertir: (texte: string) => void): Lancer {
  return (lancement) => {
    const { ticket } = lancement;
    if (ticket === undefined || !lancement.args.includes(FIN_DES_ARGUMENTS)) return lancer(lancement);
    const remettre = async () => {
      try {
        await mot.finDeTour(ticket);
      } catch (erreur) {
        avertir(`brigade : #${ticket} — the words from the chef could not be taken from the queue at the end of its cook's turn (they stay on the issue): ${message(erreur)}`);
      }
    };
    const entree = lancement.entree === undefined ? undefined : mot.entreeDuTour(ticket, lancement.entree);
    mot.debutDeTour(ticket);
    const premier = lancer({ ...lancement, ...(entree === undefined ? {} : { entree }) });
    let flux = premier.flux;
    const fin = (async () => {
      let fin = await premier.fin;
      flux = premier.flux;
      for (let reprise = 1; ; reprise += 1) {
        await remettre();
        if (!mot.aDesMots(ticket) || !fini(fin)) return fin;
        const session = sessionLue(flux ?? lancement.flux);
        if (session === null) {
          avertir(`brigade : #${ticket} — the session of its cook cannot be resumed: the word from the chef goes to its next launch`);
          return fin;
        }
        const fluxDuMot = fluxDeLaReprise(lancement.flux, reprise);
        mot.debutDeTour(ticket);
        const suite = lancer({ ...lancement, args: avecReprise(lancement.args, session), entree: mot.entreeDuTour(ticket, ENTREE_DE_LA_REPRISE), flux: fluxDuMot });
        const finDuMot = await suite.fin;
        const cumul = { turns: fin.turns + finDuMot.turns, tokens: fin.tokens + finDuMot.tokens, durationMs: fin.durationMs + finDuMot.durationMs };
        if (!fini(finDuMot)) {
          avertir(`brigade : #${ticket} — the cook resumed on a word from the chef did not finish (exit code ${finDuMot.code ?? "none"}): its delivery goes on as its previous turn left it`);
          await remettre();
          return { ...fin, ...cumul };
        }
        fin = { ...finDuMot, ...cumul };
        flux = suite.flux ?? fluxDuMot;
      }
    })();
    return {
      fin,
      get flux() {
        return flux;
      },
    };
  };
}

// Le lanceur de la station, avec le mot au cook branché sur la file du
// répertoire d'état du projet. Sans répertoire d'état, il n'y a pas de file :
// `lancer` tel quel.
export function avecLesMotsAuCook(lancer: Lancer, options: { repertoireEtat: string | undefined; avertir: (texte: string) => void }): Lancer {
  const { repertoireEtat, avertir } = options;
  if (repertoireEtat === undefined) return lancer;
  const mot = creerMotAuCook({
    // Dans le runtime, le mot n'est jamais envoyé : la commande `send-word` le fait.
    etat: () => undefined,
    commenter: async () => {},
    livrer: (ticket, texte) => avertir(`brigade : #${ticket} — a word from the chef reaches its cook at the end of its turn: ${texte}`),
    file: fileSurDisque(repertoireEtat, avertir),
  });
  return avecLesMots(lancer, mot, avertir);
}
