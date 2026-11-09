// La qualité d'un ticket mergé, lue sur GitHub (#2707). Depuis #2061, le
// chemin GitHub seul merge sans écrire le journal : ni `merge.done`, ni
// `ticket.taken`, ni `pass.*`. Le premier coup et les réparations de la base
// se lisent donc sur l'issue, au merge, par la station qui le fait : ses
// commentaires `brigade:renvoi` (une livraison renvoyée au cook) et
// `brigade:echec` (un cook sans livraison), et, sur une réparation de la base,
// la marque de son commit rouge et les checks que son corps nomme. Ce que la
// station lit s'écrit avec le temps du ticket, dans `temps-tickets.json` du
// clone (`qualite`) : les mesures le relisent de là, sur la fenêtre des temps.
//
// Des fonctions pures : rien n'est lu ni écrit ici.
import { DE_CONFIANCE } from "./alimenter.ts";
import { estUneReparation } from "./base-rouge/ouvre-reparation.ts";
import { CAUSES, compterCauses, type Cause, type CausesDesRatages } from "./causes-des-ratages.ts";
import type { QualiteDuTicket } from "./mesure-qualite.ts";
import type { Essai, Parcours } from "./renvois.ts";

// Les marques des commentaires de la station (`brigade-github.ts`), qui les écrit avec ces constantes.
export const MARQUE_DE_RENVOI = "<!-- brigade:renvoi";
export const MARQUE_D_ECHEC = "<!-- brigade:echec";
// Un arrêt que le cook n'a pas causé — quota, limite GitHub, station relancée — : le ticket attend, puis repart (#2508).
export const MARQUE_D_ATTENTE = "<!-- brigade:attente";

// Le début de la raison de chaque renvoi, que la station écrit avec ces
// constantes (`renvoyer`) : la cause se lit de là, et un texte changé ici
// change avec lui ce que la station écrit.
export const RAISONS_DE_RENVOI = {
  conflit: "the PR conflicts with the base",
  second: "the second judge requested changes",
  ci: "the CI is red on",
  relecture: "the review requested changes",
} as const;

// Ce que la qualité lit d'une issue : son corps, ses labels et ses commentaires.
export type IssueLue = { corps: string; labels: readonly string[]; commentaires: readonly { body: string; association: string }[] };

const titre = (cause: Cause) => CAUSES.find(({ cle }) => cle === cause)?.titre ?? cause;
// La raison qu'un commentaire de la station donne, après son « — ».
export const raisonDe = (corps: string) => /— ([^\n]*)/.exec(corps)?.[1] ?? "";

// La cause d'un renvoi, de la raison que la station a écrite (`brigade-github.ts`, `renvoyer`).
export function causeDuRenvoi(corps: string): Cause {
  const raison = raisonDe(corps);
  if (raison.startsWith(RAISONS_DE_RENVOI.relecture) || raison.startsWith(RAISONS_DE_RENVOI.second)) return "relecture";
  if (raison.startsWith(RAISONS_DE_RENVOI.conflit)) return "conflit";
  if (raison.startsWith(RAISONS_DE_RENVOI.ci)) {
    const checks = raison.split(":").slice(1).join(":");
    if (/types?/i.test(checks)) return "gates-types";
    if (/app/i.test(checks)) return "gates-app";
    if (/runtime|tests/i.test(checks)) return "gates-runtime";
  }
  return "autre";
}

// Les checks qu'une réparation de la base nomme, sous « What fails » (`corpsDeLaReparation`).
export function checksDeLaReparation(corps: string): string[] {
  const section = corps.split(/^## What fails\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  return [...section.matchAll(/^- `([^`\n]+)`\s*$/gm)].map(([, nom]) => nom as string);
}

// La qualité d'un ticket mergé, de ce que GitHub en dit : ses renvois, avec
// leur cause, ses cooks sans livraison — dont le motif est un texte libre, que
// rien ne classe : leur cause est « autre » —, et ce qu'il répare s'il est une
// réparation de la base. Seuls comptent les commentaires de confiance, ceux
// des stations ; tous, même d'avant un relancement : il n'a pas été livré du
// premier coup.
export function qualiteDeLIssue({ corps, labels, commentaires }: IssueLue): QualiteDuTicket {
  const siens = commentaires.filter(({ association }) => DE_CONFIANCE.includes(association));
  const renvois = siens.filter(({ body }) => body.startsWith(MARQUE_DE_RENVOI)).map(({ body }) => titre(causeDuRenvoi(body)));
  const cooksRates = siens.filter(({ body }) => body.startsWith(MARQUE_D_ECHEC)).length;
  return { renvois, cooksRates, ...(estUneReparation(corps, [...labels]) ? { reparation: checksDeLaReparation(corps) } : {}) };
}

const textes = (valeur: unknown): valeur is string[] => Array.isArray(valeur) && valeur.every((v) => typeof v === "string");

// La qualité qu'un enregistrement de temps porte, si elle a la forme écrite ; sinon null.
export function qualiteLue(valeur: unknown): QualiteDuTicket | null {
  if (typeof valeur !== "object" || valeur === null) return null;
  const { renvois, cooksRates, reparation } = valeur as Record<string, unknown>;
  if (!textes(renvois) || typeof cooksRates !== "number" || !Number.isInteger(cooksRates) || cooksRates < 0) return null;
  if (reparation !== undefined && !textes(reparation)) return null;
  return { renvois, cooksRates, ...(reparation === undefined ? {} : { reparation }) };
}

type Enregistre = { ticket: number; qualite?: unknown };

// La qualité de chaque ticket dont l'enregistrement de temps la porte. Ceux
// mergés avant #2707, ou dont GitHub n'a pas répondu au merge, n'y sont pas :
// leur qualité est inconnue.
export function qualitesDesTemps(enregistrements: readonly Enregistre[]): Map<number, QualiteDuTicket> {
  const qualites = new Map<number, QualiteDuTicket>();
  for (const { ticket, qualite } of enregistrements) {
    const lue = qualiteLue(qualite);
    if (lue !== null) qualites.set(ticket, lue);
  }
  return qualites;
}

// Le parcours de chaque ticket dont la qualité est connue, dans l'ordre des
// enregistrements, pour les mesures des renvois (`renvois.ts`) : ses cooks
// sans livraison, ses livraisons renvoyées, puis celle qui est mergée.
export function parcoursDesTemps(enregistrements: readonly (Enregistre & { claimedAt?: string; mergedAt?: string })[]): Parcours[] {
  return enregistrements.flatMap(({ ticket, qualite, claimedAt, mergedAt }) => {
    const lue = qualiteLue(qualite);
    if (lue === null || mergedAt === undefined) return [];
    const debut = claimedAt ?? mergedAt;
    const essai = (outcome: string, verdict: Essai["verdict"]): Essai => ({ run: `${ticket}`, at: debut, outcome, verdict });
    const attempts = [...Array.from({ length: lue.cooksRates }, () => essai("failed", null)), ...lue.renvois.map(() => essai("ok", "red")), essai("ok", "green")];
    return [{ ticket, takenAt: debut, end: { kind: "merged" as const, at: mergedAt }, attempts }];
  });
}

const cleDe = (nom: string): Cause => CAUSES.find(({ titre: t }) => t === nom)?.cle ?? "autre";

// Les causes des essais ratés de ces tickets : leurs renvois et leurs cooks sans livraison.
export function causesDesTemps(enregistrements: readonly Enregistre[]): CausesDesRatages {
  return compterCauses(
    enregistrements.flatMap(({ ticket, qualite }) => {
      const lue = qualiteLue(qualite);
      if (lue === null) return [];
      const ratees = Array.from({ length: lue.cooksRates }, () => titre("autre"));
      return [...ratees, ...lue.renvois].map((nom) => ({ ticket, cause: cleDe(nom) }));
    }),
  );
}
