// Ce que l'histoire des rétros change au carnet du dépôt, prêt à livrer : les
// décisions, le carnet qui en résulte, et la PR qui les porte. Logique pure,
// sans I/O : le carnet de la base, les rétros du journal, les seuils, le jour
// et les livraisons du carnet déjà mergées entrent ; le changement sort, ou
// null quand il n'y a rien à livrer.
//
// Les décisions viennent de la péremption (`peremption/peremption.ts`) — sauf
// une, qui vient d'ici : le retrait par revert. Une leçon qu'une livraison
// mergée a laissée promue, et que le carnet de la base ne porte plus, n'a pas
// été rétrogradée par le runtime — celle-là, il l'aurait livrée. Le chef l'a
// retirée en revertant sa PR : elle entre au carnet `retired`, son id gardé,
// sortie au jour où le runtime le constate. La péremption ne compte ensuite
// que les citations d'après.
import { CARNET_PATH, writeCarnet, type Carnet, type Lesson } from "../carnet/carnet.ts";
import type { Retro } from "../apprentissage/provisoires.ts";
import { decider, histoireDesRetros, type Decision, type LeconHistoire } from "../peremption/peremption.ts";
import type { Seuils } from "../seuils/seuils.ts";
import type { LeconChangee } from "./evenements.ts";

export type Changement =
  | Decision
  // Le chef l'a retirée en revertant `pr`, la livraison qui l'avait promue :
  // `retros`, celles qui l'y avaient portée.
  | { kind: "retire"; lesson: string; retros: string[]; pr: string };

// Une livraison du carnet mergée : sa PR, et ce qu'elle a changé.
export type Fusionnee = { pr: string; lessons: LeconChangee[] };

export type Entree = {
  carnet: Carnet;
  retros: Retro[];
  seuils: Seuils;
  // Le jour du changement, AAAA-MM-JJ : celui des sorties qu'il écrit.
  aujourdhui: string;
  // Dans l'ordre de leur livraison.
  fusionnees: Fusionnee[];
};

export type ChangementDuCarnet = {
  decisions: Changement[];
  carnet: Carnet;
  lessons: LeconChangee[];
  // Le texte du carnet à écrire, tel que `writeCarnet` le rend.
  texte: string;
  titre: string;
  corps: string;
};

const parId = (carnet: Carnet) => new Map(carnet.lessons.map((l) => [l.id, l]));
const ordre = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true }) || (a < b ? -1 : a > b ? 1 : 0);

// Les leçons qu'un revert a retirées : promues par la dernière livraison
// mergée qui les a changées, absentes du carnet de la base.
export function retireesParRevert(carnet: Carnet, fusionnees: Fusionnee[], aujourdhui: string): { decisions: Changement[]; carnet: Carnet } {
  const presentes = parId(carnet);
  const derniere = new Map<string, { pr: string; after: Lesson | null }>();
  for (const f of fusionnees) for (const l of f.lessons) derniere.set(l.id, { pr: f.pr, after: l.after });
  const decisions: Changement[] = [];
  const lessons = [...carnet.lessons];
  for (const [id, { pr, after }] of [...derniere].sort(([a], [b]) => ordre(a, b))) {
    if (after?.state !== "promoted" || presentes.has(id)) continue;
    decisions.push({ kind: "retire", lesson: id, retros: after.retros, pr });
    // Une livraison d'avant l'origine ne l'écrivait pas : la leçon était née d'une rétro.
    lessons.push({ ...after, origin: after.origin ?? { kind: "retro" }, state: "retired", exit: { date: aujourdhui, reason: "manual" } });
  }
  return { decisions, carnet: { lessons } };
}

// Le changement à livrer, ou null : aucune décision, ou un carnet qui ne
// bouge pas.
export function changementDuCarnet(entree: Entree): ChangementDuCarnet | null {
  const { carnet, retros, seuils, aujourdhui, fusionnees } = entree;
  const retraits = retireesParRevert(carnet, fusionnees, aujourdhui);
  const histoire = histoireDesRetros(retros);
  const jugement = decider({ histoire, carnet: retraits.carnet, seuils, servis: retros.length, aujourdhui });
  const decisions = [...retraits.decisions, ...jugement.decisions];
  const texte = writeCarnet(jugement.carnet);
  if (decisions.length === 0 || texte === writeCarnet(carnet)) return null;

  const avant = parId(carnet);
  const apres = parId(jugement.carnet);
  const lessons = [...new Set([...avant.keys(), ...apres.keys()])]
    .sort(ordre)
    .flatMap((id): LeconChangee[] => {
      const a = avant.get(id);
      const b = apres.get(id) ?? null;
      return a !== undefined && b !== null && writeCarnet({ lessons: [a] }) === writeCarnet({ lessons: [b] }) ? [] : [{ id, after: b }];
    });
  return { decisions, carnet: jugement.carnet, lessons, texte, titre: titreDeLaPR(decisions), corps: corpsDeLaPR({ decisions, histoire, retros, seuils, carnet, resultat: jugement.carnet }) };
}

const DIT: Record<Changement["kind"], string> = { promote: "promue", demote: "rétrogradée", delete: "expirée", retire: "retirée" };

export function titreDeLaPR(decisions: Changement[]): string {
  const parGenre = new Map<string, string[]>();
  for (const d of decisions) parGenre.set(DIT[d.kind], [...(parGenre.get(DIT[d.kind]) ?? []), d.lesson]);
  return `Carnet des leçons — ${[...parGenre].map(([dit, ids]) => `${dit} ${ids.join(", ")}`).join(" ; ")}`;
}

const pluriel = (n: number, mot: string) => `${n} ${n > 1 ? mot.replace(/(\S)(?=\s|$)/g, "$1s") : mot}`;

// Le corps de la PR : c'est lui que le reviewer lit à la place d'un ticket.
// Chaque décision y nomme ses rétros — le ticket qu'elles suivent, et si
// elles ont proposé ou reconfirmé la leçon.
function corpsDeLaPR(contexte: { decisions: Changement[]; histoire: LeconHistoire[]; retros: Retro[]; seuils: Seuils; carnet: Carnet; resultat: Carnet }): string {
  const { decisions, histoire, retros, seuils } = contexte;
  const ticketDe = new Map(retros.map((r) => [r.ref, r.ticket]));
  const rangDe = new Map(retros.map((r, i) => [r.ref, i + 1]));
  const textes = new Map([...contexte.carnet.lessons, ...contexte.resultat.lessons].map((l) => [l.id, l.text]));
  for (const l of histoire) textes.set(l.id, l.texte);
  const genreDe = (lecon: string, retro: string) => histoire.find((l) => l.id === lecon)?.citations.find((c) => c.retro === retro)?.genre;
  const retro = (lecon: string, ref: string) => {
    const ticket = ticketDe.get(ref);
    const genre = genreDe(lecon, ref);
    return `- \`${ref}\`${ticket === undefined ? "" : ` — ticket #${ticket}`}${genre === undefined ? "" : genre === "propose" ? ", qui l'a proposée" : ", qui l'a reconfirmée"}`;
  };
  const depuis = (ref: string | undefined) => {
    const rang = ref === undefined ? undefined : rangDe.get(ref);
    return rang === undefined ? "aucune rétro ne l'a citée" : `sa dernière citation date du ticket servi n° ${rang}, il y a ${pluriel(retros.length - rang, "ticket servi")}`;
  };
  const sections = decisions.flatMap((d) => {
    const entete = [`### ${DIT[d.kind][0]?.toUpperCase()}${DIT[d.kind].slice(1)} — ${d.lesson}`, "", `> ${textes.get(d.lesson) ?? ""}`, ""];
    switch (d.kind) {
      case "promote": {
        const tickets = new Set(d.retros.map((r) => ticketDe.get(r))).size;
        return [...entete, `Les rétros qui la proposent, sur ${pluriel(tickets, "ticket")} différent${tickets > 1 ? "s" : ""} :`, "", ...d.retros.map((r) => retro(d.lesson, r)), ""];
      }
      case "demote":
        return [...entete, `Aucune rétro ne l'a reconfirmée depuis ${pluriel(seuils.expirationPromue, "ticket servi")} au moins : ${depuis(d.retros[0])}. Elle quitte le carnet et redevient provisoire, dans le journal du runtime.`, "", ...d.retros.map((r) => retro(d.lesson, r)), ""];
      case "delete":
        return [...entete, `Provisoire, aucune rétro ne l'a reconfirmée depuis ${pluriel(seuils.expirationProvisoire, "ticket servi")} au moins : ${depuis(d.retros[0])}. Elle disparaît : sa sortie reste au carnet, \`état: expired\`.`, "", ...d.retros.map((r) => retro(d.lesson, r)), ""];
      case "retire":
        return [...entete, `Promue par ${d.pr}, elle n'est plus dans le carnet de la base : la PR qui l'avait promue a été revertée. Elle y entre \`état: retired\`, son id gardé ; seules les rétros d'après ce jour compteront pour la repromouvoir.`, ""];
    }
  });
  return [
    `**Carnet des leçons du projet** (\`${CARNET_PATH}\`), livré par le runtime de la brigade : ce que l'histoire des rétros décide des leçons des cooks. Elle passe par la pass comme une livraison — gates, relecture, CI, grant \`merge\` — et n'attend pas le chef. Elle ne touche que le carnet.`,
    "",
    `Seuils du projet : promue à ${pluriel(seuils.promotion, "rétro")} de tickets différents ; une promue que rien ne reconfirme pendant ${pluriel(seuils.expirationPromue, "ticket servi")} redevient provisoire, une provisoire disparaît ${pluriel(seuils.expirationProvisoire, "ticket servi")} plus tard. ${pluriel(retros.length, "ticket servi")} à ce jour.`,
    "",
    ...sections,
    "---",
    "",
    "Retirer une leçon promue : reverter la PR qui l'a promue, ou ouvrir une PR qui passe son entrée à `état: retired`, avec `sortie: AAAA-MM-JJ` et `raison: manual`. Elle garde son id, et ne revient que si de nouvelles rétros la reproposent (doc de la brigade : `docs/runtime/carnet-lecons.md`).",
  ].join("\n");
}
