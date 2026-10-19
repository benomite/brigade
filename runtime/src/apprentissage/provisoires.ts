// Les leçons provisoires d'un projet : celles que les rétros des tickets servis
// lui ont laissées, dans la base du runtime. Rien ne les valide — elles sont
// lisibles dès que le ticket qui les a produites est servi. Ce module écrit la
// rétro d'un ticket servi (`retro.recorded`) et relit, pour un projet et pour
// lui seul, ses rétros et ses leçons. Ce qui les injecte dans un cook, ou les
// montre, les lit d'ici.
//
// Les leçons ne sont pas une table à part : elles se recalculent du journal,
// rétro après rétro, dans l'ordre. Un id (`L1`, `L2`…) est donc stable — le
// journal n'est qu'en ajout — et une rétro qui reconfirme une leçon cite un id
// qui existait quand elle a été écrite.
import type { Base } from "../base.ts";
import type { Journal } from "../journal.ts";
import type { EntreeRetenue, Ecart } from "./evenements.ts";
import { carnetVide, type Carnet, type Lecon } from "./lecons.ts";
import { appliquerRetenues, trierRetro } from "./retro.ts";

// La rétro d'un ticket servi, telle que le journal la garde. `ref` : sa
// référence, celle que portent les entrées des leçons qu'elle a laissées.
export type Retro = {
  ref: string;
  seq: number;
  at: string;
  project: string;
  ticket: number;
  run: string | null;
  text: string | null;
  kept: EntreeRetenue[];
  dropped: { line: string; reason: Ecart }[];
};

// Une leçon du projet, avec ce qui la situe : son projet, le ticket qui l'a
// proposée et quand.
export type LeconDuProjet = Lecon & { project: string; ticket: number; at: string };

const refDe = (seq: number) => `retro-${seq}`;

type Ligne = { seq: number; at: string; project: string; ticket: number; payload: string };

// Les rétros du projet, dans l'ordre du journal. Celles d'un autre projet,
// même dans la même base, n'en sont jamais.
export function retrosDuProjet(base: Base, projet: string): Retro[] {
  return base
    .lire<Ligne>("SELECT seq, at, project, ticket, payload FROM events WHERE type = 'retro.recorded' AND project = ? AND ticket IS NOT NULL ORDER BY seq", projet)
    .map((ligne) => {
      const payload = JSON.parse(ligne.payload) as Pick<Retro, "run" | "text" | "kept" | "dropped">;
      return { ref: refDe(ligne.seq), seq: ligne.seq, at: ligne.at, project: ligne.project, ticket: ligne.ticket, ...payload };
    });
}

// La dernière rétro du ticket, ou null s'il n'a jamais été servi depuis que
// les rétros existent.
export function retroDuTicket(base: Base, projet: string, ticket: number): Retro | null {
  return retrosDuProjet(base, projet).findLast((retro) => retro.ticket === ticket) ?? null;
}

// Le carnet des leçons du projet, recalculé de ses rétros.
export function carnetDuProjet(base: Base, projet: string): Carnet {
  return retrosDuProjet(base, projet).reduce((carnet, retro) => appliquerRetenues(carnet, retro.kept, { retro: retro.ref, ticket: retro.ticket }), carnetVide());
}

// Les leçons provisoires du projet, de la plus ancienne à la plus récente.
export function leconsProvisoires(base: Base, projet: string): LeconDuProjet[] {
  const quand = new Map(retrosDuProjet(base, projet).map((retro) => [retro.ref, retro.at]));
  return carnetDuProjet(base, projet).lecons.flatMap((lecon) => {
    const source = lecon.entrees.find((e) => e.genre === "propose") ?? lecon.entrees[0];
    if (lecon.statut !== "provisoire" || !source) return [];
    return [{ ...lecon, project: projet, ticket: source.ticket, at: quand.get(source.retro) ?? "" }];
  });
}

// Écrit la rétro du ticket qui vient d'être servi : celle que le cook `run` a
// délimitée dans son dernier message, triée face aux leçons du projet. Un cook
// qui n'en a rien écrit laisse une rétro vide — elle est écrite tout de même :
// chaque ticket servi a la sienne. À appeler dans la transaction qui le sert.
export function enregistrerRetro(journal: Journal, mission: { projet: string; ticket: number; run: string | null; auteur: string }): Retro | null {
  const { projet, ticket, run, auteur } = mission;
  const rapport = run === null ? undefined : journal.duTicket(ticket).findLast((e) => e.project === projet && e.type === "cook.reported" && e.payload.run === run);
  const text = rapport?.type === "cook.reported" ? (rapport.payload.retro ?? null) : null;
  const tri = trierRetro(text, carnetDuProjet(journal.base, projet));
  const ecrit = journal.ajouter({
    project: projet,
    ticket,
    author: auteur,
    type: "retro.recorded",
    payload: { run, text, kept: tri.kept, dropped: tri.dropped },
    ...(run === null ? {} : { dedupKey: `retro.recorded:${projet}:${ticket}:${run}` }),
  });
  return ecrit === null ? null : retroDuTicket(journal.base, projet, ticket);
}
