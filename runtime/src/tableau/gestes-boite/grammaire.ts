// Les gestes du chef qui n'existaient que sur la box, postés sur le tableau
// de la cuisine comme ceux de tableau/gestes/ : la première ligne d'un commentaire est
//
//   /brigade cooks <N | auto>                       le plafond de cooks simultanés (`station -- cooks`)
//   /brigade stop                                   arrête la cuisine du projet (`guardrails -- stop`)
//   /brigade resume                                 la rouvre (`guardrails -- resume`)
//   /brigade base replay                            rejoue les gates d'une base rouge (`base -- replay`)
//   /brigade grant <enable|extend|revoke> merge [options]    le grant merge (`grant -- …`)
//   /brigade station <stop|start> <station>         la cuisine du projet sur une station
//
// Pur : rien n'est lu ni joué ici. Un geste de box ne porte pas de ticket. Ce
// qui suit le verbe est vérifié autant qu'il se peut sans la commande — les
// options d'un grant sont jugées par `grant`, qui les refuse en disant ce
// qu'elle attend. Le détail, avec un exemple par geste : docs/tableau-gestes.md.
import { PREFIXE } from "../gestes/grammaire.ts";

export type GesteDeBoite = {
  // Le geste en deux mots, tel que la réponse le nomme : `cooks 4`, `base replay`.
  nom: string;
  // La commande locale qui le joue, avec ses arguments.
  commande: "station" | "guardrails" | "base" | "grant";
  args: string[];
};

export type LectureDeBoite = GesteDeBoite | { incompris: string } | null;

export const GRAMMAIRE_DE_BOITE = [
  `${PREFIXE} cooks <N | auto>`,
  `${PREFIXE} stop`,
  `${PREFIXE} resume`,
  `${PREFIXE} base replay`,
  `${PREFIXE} grant <enable | extend | revoke> merge [--for <duration> | --until <date or time>] [--uses <n>] [--no-expiry]`,
  `${PREFIXE} station <stop | start> <station>`,
];

const VERBES = ["cooks", "stop", "resume", "base", "grant", "station"];
const PLAFOND = /^(0|[1-9][0-9]{0,5})$/;
const COMMANDES_DE_GRANT = ["enable", "extend", "revoke"];

// Le geste de box que porte un commentaire, ou `null` s'il n'en porte pas —
// c'est alors aux gestes du tableau de le lire.
export function lireUnGesteDeBoite(corps: string): LectureDeBoite {
  const premiere = corps.replace(/\r\n?/g, "\n").replace(/^\s*\n/, "").split("\n")[0] ?? "";
  const ligne = premiere.trim();
  if (ligne !== PREFIXE && !ligne.startsWith(`${PREFIXE} `) && !ligne.startsWith(`${PREFIXE}\t`)) return null;
  const [verbe = "", ...reste] = ligne.slice(PREFIXE.length).trim().split(/\s+/);
  if (!VERBES.includes(verbe)) return null;
  const incompris = (raison: string) => ({ incompris: raison });
  switch (verbe) {
    case "cooks": {
      const [valeur, ...deTrop] = reste;
      if (valeur === undefined || deTrop.length > 0 || !(valeur === "auto" || PLAFOND.test(valeur))) {
        return incompris("cooks needs one cap: a number of simultaneous cooks (0 for no limit), or `auto`");
      }
      return { nom: `cooks ${valeur}`, commande: "station", args: ["cooks", valeur] };
    }
    case "stop":
    case "resume":
      if (reste.length > 0) return incompris(`${verbe} takes nothing after it`);
      return { nom: verbe, commande: "guardrails", args: [verbe] };
    case "base":
      if (reste.length !== 1 || reste[0] !== "replay") return incompris("base needs `replay`, and nothing else");
      return { nom: "base replay", commande: "base", args: ["replay"] };
    case "grant": {
      const [commande, action, ...options] = reste;
      if (commande === undefined || !COMMANDES_DE_GRANT.includes(commande) || action !== "merge") {
        return incompris("grant needs `enable`, `extend` or `revoke`, then `merge`, then the options of the local `grant` if any");
      }
      return { nom: `grant ${commande} merge`, commande: "grant", args: [commande, action, ...options] };
    }
    default: {
      const [commande, station, ...deTrop] = reste;
      if ((commande !== "stop" && commande !== "start") || station === undefined || deTrop.length > 0) {
        return incompris("station needs `stop` or `start`, then one station");
      }
      return { nom: `station ${commande} ${station}`, commande: "station", args: [commande, station] };
    }
  }
}
