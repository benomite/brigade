// L'histoire d'un ticket et ce qu'il a coûté, lus du journal, en lecture seule :
// ce que la fiche d'un ticket de l'app montre, et rien que ce que le journal dit.
//
// Les étapes sont dans l'ordre du journal — celui de la séquence, donc le
// chronologique. Une étape qui n'a pas eu lieu est absente, et une étape qui a
// eu lieu plusieurs fois (un ticket repris, relu deux fois) y est autant de
// fois. Rien n'est deviné : le coût dit `null` ce que la box ne sait pas — un
// cook mort avec le runtime n'a ni tokens ni durée —, jamais 0.
//
// S'y ajoute la rétro du ticket servi (apprentissage/provisoires.ts) : ce que
// son cook a écrit, et les leçons provisoires qu'elle a laissées au projet.
import { carnetDuProjet, retroDuTicket } from "./apprentissage/provisoires.ts";
import type { Base } from "./base.ts";

export type Etape =
  | { kind: "arrived"; at: string }
  // `station` : la station qui l'a pris.
  | { kind: "taken"; at: string; station: string }
  // Un cook de ticket a fini sur `ok` : sa livraison part en pass. `run` : ce cook.
  | { kind: "delivered"; at: string; run: string }
  // La relecture : `verdict` dit `unreadable` quand le reviewer a répondu sans
  // qu'on y lise rien. `summary` : nul quand elle n'en a pas rendu.
  | { kind: "reviewed"; at: string; verdict: "green" | "red" | "unreadable"; summary: string | null }
  // Le jugement de la pass sur la livraison.
  | { kind: "judged"; at: string; verdict: "green" | "red" }
  // La livraison est dans la base d'intégration. `by` : la pass, ou quelqu'un d'autre.
  | { kind: "merged"; at: string; by: "pass" | "outside" }
  // Servi sans merge : aucun diff, le ticket l'est sur la foi de sa relecture.
  | { kind: "served"; at: string };

// Ce que le ticket a consommé, tous ses cooks de ticket additionnés (la
// relecture et le jugement du manager n'y sont pas). `attempts` : combien de
// cooks ont été lancés — il est toujours connu. `tokens`, `durationMs` : la
// somme de ce que les cooks finis ont déclaré, nulle si aucun n'a rien
// déclaré. `incomplete` : au moins un cook n'a rien déclaré (il tourne encore,
// ou est mort avec le runtime) — les sommes sont alors un minimum.
export type Cout = { attempts: number; tokens: number | null; durationMs: number | null; incomplete: boolean };

// Une leçon que la rétro a laissée : une leçon nouvelle (`propose`) ou une
// leçon du projet qu'elle reconfirme (`reconfirm`), avec son id et son texte —
// nuls quand le carnet recalculé du projet ne la retrouve pas.
export type LeconDeLaRetro = { kind: "propose" | "reconfirm"; id: string | null; text: string | null };

// La dernière rétro du ticket : `text`, ce que son cook a écrit entre
// `<retro>` et `</retro>`, nul s'il n'en a rien écrit ; `lessons`, ce qu'elle a
// retenu, au plus trois, dans l'ordre de la rétro.
export type RetroDuTicket = { at: string; text: string | null; lessons: LeconDeLaRetro[] };

// `retro` : nulle tant que le ticket n'a pas été servi — seul un ticket servi a
// la sienne.
export type HistoireDuTicket = { ticket: number; steps: Etape[]; cost: Cout; retro: RetroDuTicket | null };

// Les stations que la pass et le manager lancent : ni une relecture ni un
// jugement ne cuisine un ticket.
const HORS_TICKET = ["reviewer", "manager"];

type Ligne = { at: string; type: string; payload: string };

const entier = (valeur: unknown): number | null => (Number.isSafeInteger(valeur) ? (valeur as number) : null);

export function histoireDuTicket(base: Base, ticket: number): HistoireDuTicket {
  const lignes = base.lire<Ligne>("SELECT at, type, payload FROM events WHERE ticket = ? ORDER BY seq", ticket);
  const steps: Etape[] = [];
  // Par run, le lancement d'un cook de ticket et, s'il a fini, ce qu'il déclare.
  const cooks = new Map<string, { tokens: number | null; durationMs: number | null; ok: boolean }>();
  const lancements: string[] = [];

  for (const { at, type, payload } of lignes) {
    const p = JSON.parse(payload) as Record<string, unknown>;
    switch (type) {
      case "ticket.arrived":
        // Un ticket revenu sur le rail n'arrive qu'une fois : la première date.
        if (!steps.some((etape) => etape.kind === "arrived")) steps.push({ kind: "arrived", at });
        break;
      case "ticket.taken":
        if (typeof p.station === "string") steps.push({ kind: "taken", at, station: p.station });
        break;
      case "cook.launched": {
        const station = p.station;
        if (typeof p.run !== "string" || (typeof station === "string" && HORS_TICKET.includes(station))) break;
        cooks.set(p.run, { tokens: null, durationMs: null, ok: false });
        lancements.push(p.run);
        break;
      }
      case "cook.exited": {
        const cook = typeof p.run === "string" ? cooks.get(p.run) : undefined;
        if (cook === undefined || typeof p.run !== "string") break;
        cook.tokens = entier(p.tokens);
        cook.durationMs = entier(p.durationMs);
        cook.ok = p.outcome === "ok";
        if (cook.ok) steps.push({ kind: "delivered", at, run: p.run });
        break;
      }
      case "pass.reviewed": {
        const verdict = p.outcome;
        if (verdict !== "green" && verdict !== "red" && verdict !== "unreadable") break;
        steps.push({ kind: "reviewed", at, verdict, summary: typeof p.summary === "string" ? p.summary : null });
        break;
      }
      case "pass.judged":
        if (p.verdict === "green" || p.verdict === "red") steps.push({ kind: "judged", at, verdict: p.verdict });
        break;
      case "merge.done":
        steps.push({ kind: "merged", at, by: p.by === "outside" ? "outside" : "pass" });
        break;
      case "pass.served":
        steps.push({ kind: "served", at });
        break;
    }
  }

  const connus = lancements.map((run) => cooks.get(run)).filter((cook) => cook !== undefined);
  const somme = (valeurs: (number | null)[]) => {
    const declarees = valeurs.filter((valeur) => valeur !== null);
    return declarees.length === 0 ? null : declarees.reduce((total, valeur) => total + valeur, 0);
  };
  const cost: Cout = {
    attempts: connus.length,
    tokens: somme(connus.map((cook) => cook.tokens)),
    durationMs: somme(connus.map((cook) => cook.durationMs)),
    incomplete: connus.some((cook) => cook.tokens === null || cook.durationMs === null),
  };
  return { ticket, steps, cost, retro: retroDe(base, ticket) };
}

// La rétro du ticket, lue au projet qui l'a écrite : ses leçons ne se
// retrouvent que parmi celles de ce projet.
function retroDe(base: Base, ticket: number): RetroDuTicket | null {
  const [ecrite] = base.lire<{ project: string }>("SELECT project FROM events WHERE type = 'retro.recorded' AND ticket = ? ORDER BY seq DESC LIMIT 1", ticket);
  if (ecrite === undefined) return null;
  const retro = retroDuTicket(base, ecrite.project, ticket);
  if (retro === null) return null;
  const { lecons } = carnetDuProjet(base, ecrite.project);
  const lessons = retro.kept.map((entree): LeconDeLaRetro => {
    if (entree.kind === "reconfirm") return { kind: "reconfirm", id: entree.id, text: lecons.find((lecon) => lecon.id === entree.id)?.texte ?? null };
    // Une leçon nouvelle : celle que cette rétro a fait naître, de ce texte.
    const nee = lecons.find((lecon) => lecon.texte === entree.text.trim() && lecon.entrees.some((e) => e.genre === "propose" && e.retro === retro.ref));
    return { kind: "propose", id: nee?.id ?? null, text: entree.text };
  });
  return { at: retro.at, text: retro.text, lessons };
}
