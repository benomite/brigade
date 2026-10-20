// Le « oui » ou le « non » du chef sur un profil proposé. Un profil n'existe
// que s'il dit « oui » ; une proposition que personne ne tranche reste dans la
// file, et rien n'en naît.
//
// - « oui » (`profile.accepted`) : la définition du profil est écrite dans le
//   dépôt du projet, sous `.claude/brigade/profils/` (`definition.ts`), avec
//   son carnet de départ. Une définition déjà là n'est jamais remplacée.
// - « non » (`profile.refused`) : la proposition quitte la file, et le « non »
//   nomme les tickets du domaine que le journal avait servis à cet instant. Le
//   domaine n'est proposé de nouveau que s'il franchit les seuils sur d'autres
//   (`proposer.ts`).
//
// Une proposition se tranche une fois : un second geste, le même ou l'autre,
// n'écrit rien et rend le premier.
import { RETRO_ORIGIN } from "../carnet/carnet.ts";
import type { Evenement } from "../evenements.ts";
import type { Journal } from "../journal.ts";
import { definitionExiste, fichierDuProfil, saveDefinition } from "./definition.ts";
import { ticketsServis } from "./domaines.ts";
import { ticketsDuDomaine, type Proposee } from "./proposer.ts";

export type Acceptee = Extract<Evenement, { type: "profile.accepted" }>;
export type Refusee = Extract<Evenement, { type: "profile.refused" }>;

export const OUI = "yes";
export const NON = "no";
export type Reponse = typeof OUI | typeof NON;

const TOUS = Number.MAX_SAFE_INTEGER;

// `tranchee` : le geste vient d'être écrit. `deja` : la proposition l'était,
// et `fait` est ce qui l'a tranchée. `inconnue` : aucune proposition ne porte
// ce numéro. `existe` : un « oui » sur un profil que le dépôt définit déjà —
// rien n'est écrit, la proposition attend toujours.
export type Decision = { issue: "tranchee" | "deja"; fait: Acceptee | Refusee } | { issue: "inconnue" } | { issue: "existe"; fichier: string };

export function propositionDe(journal: Journal, proposition: number): Proposee | null {
  return journal.duType("profile.proposed", TOUS).find(({ seq }) => seq === proposition) ?? null;
}

// Ce qui a tranché la proposition, ou null si rien ne l'a encore fait.
export function decisionDe(journal: Journal, proposition: number): Acceptee | Refusee | null {
  const tranchees = [...journal.duType("profile.accepted", TOUS), ...journal.duType("profile.refused", TOUS)];
  return tranchees.find(({ payload }) => payload.proposal === proposition) ?? null;
}

export type OptionsDeDecision = { journal: Journal; projet: string; repoDir: string };

// Écrit le geste du chef sur la proposition `proposition` (son `seq`), d'un
// seul geste : relue, puis tranchée — la même clé d'unicité tient le « oui »
// et le « non ». Sur un « oui », la définition s'écrit dans la même
// transaction : un fichier qui ne s'écrit pas ne laisse aucun « oui » au
// journal.
export function decider({ journal, projet, repoDir }: OptionsDeDecision, proposition: number, reponse: Reponse): Decision {
  return journal.base.transaction((): Decision => {
    const proposee = propositionDe(journal, proposition);
    if (proposee === null) return { issue: "inconnue" };
    const deja = decisionDe(journal, proposition);
    if (deja !== null) return { issue: "deja", fait: deja };
    const { name, zone, tickets, perimeter, skills, notebook } = proposee.payload;
    if (reponse === OUI && definitionExiste(repoDir, name)) return { issue: "existe", fichier: fichierDuProfil(name) };

    const commun = { project: projet, ticket: null, author: "chef", dedupKey: `profile.decision:${proposition}` } as const;
    const fait =
      reponse === OUI
        ? journal.ajouter({ ...commun, type: "profile.accepted", payload: { proposal: proposition, name, zone, file: fichierDuProfil(name) } })
        : journal.ajouter({
            ...commun,
            type: "profile.refused",
            // Tous les tickets du domaine que le journal porte, pas seulement
            // ceux de la fenêtre : aucun d'eux n'est neuf après ce « non ».
            payload: { proposal: proposition, name, zone, tickets: ticketsDuDomaine(ticketsServis(journal.base), zone) },
          });
    if (fait === null) throw new Error(`le profil proposé ${proposition} est tranché sans que le journal le dise`);
    // Une proposition d'avant l'origine des leçons ne l'écrivait pas : elles
    // étaient nées d'une rétro.
    const lessons = notebook.map((lecon) => ({ ...lecon, origin: lecon.origin ?? RETRO_ORIGIN }));
    if (fait.type === "profile.accepted") saveDefinition(repoDir, { name, zone, perimeter, skills, accepted: fait.at.slice(0, 10), tickets, notebook: { lessons } });
    return { issue: "tranchee", fait: fait as Acceptee | Refusee };
  });
}
