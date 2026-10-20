// La péremption des leçons : ce que l'histoire des rétros décide du carnet —
// promouvoir une leçon provisoire, rétrograder une leçon promue, supprimer une
// leçon provisoire. Logique pure, sans I/O : l'histoire, le carnet, les seuils
// et le compte des tickets servis entrent ; les décisions, chacune avec les
// rétros qui la justifient, et le carnet qui en résulte, sortent. Ce qui les
// livre (une PR par la passe) est ailleurs.
//
// Le temps se compte en tickets servis : une citation porte le rang du ticket
// servi dont la rétro l'a écrite (`servi`, à partir de 1), et `servis` est le
// compte des tickets servis à présent. La rétro d'un ticket fait partie de ce
// ticket : une leçon citée au ticket servi 23 a été reconfirmée « dans » les
// tickets 4 à 23.
//
// Les règles :
// - une leçon provisoire est promue quand `seuils.promotion` rétros de tickets
//   distincts la citent (égalité exacte de l'id ; deux rétros d'un même ticket
//   comptent pour une). Proposer la leçon est une citation ;
// - une leçon promue qu'aucune citation ne reconfirme pendant
//   `seuils.expirationPromue` tickets servis redevient provisoire. Ses
//   citations d'avant ne comptent plus pour la promouvoir : sans cela, elle
//   remonterait aussitôt ;
// - une leçon provisoire qu'aucune citation ne reconfirme pendant
//   `seuils.expirationProvisoire` tickets servis — comptés depuis sa dernière
//   citation, ou depuis sa rétrogradation — est supprimée : elle entre au
//   carnet comme expirée, sa sortie y reste ;
// - une leçon retirée par le chef (ou expirée) garde son id ; seules les
//   citations écrites après sa sortie comptent pour une nouvelle promotion.
//
// Le carnet du dépôt ne tient que les leçons promues et les sorties : une
// leçon qui n'y est pas est provisoire, dans la base du runtime. Rétrograder
// une leçon la retire donc du carnet. Le point de sa rétrogradation n'y est
// pas écrit : il se retrouve en rejouant son histoire, qui est la source.
//
// Une sortie est datée au jour (`AAAA-MM-JJ`) : une citation du jour même
// d'un retrait est tenue pour antérieure — le doute va au retrait du chef.
import { RETRO_ORIGIN, type Carnet, type Lesson, type LessonOrigin } from "../carnet/carnet.ts";
import type { Seuils } from "../seuils/seuils.ts";
import { appliquerSource, entrelacer, type LeconCandidate, type Retro } from "../apprentissage/provisoires.ts";
import { carnetVide } from "../apprentissage/lecons.ts";

// Une rétro qui cite une leçon : elle la propose ou la reconfirme.
export type Citation = {
  genre: "propose" | "reconfirme";
  // La référence de la rétro (« retro-12 ») et le ticket qu'elle suit.
  retro: string;
  ticket: number;
  // Le rang du ticket servi dont la rétro l'a écrite, à partir de 1.
  servi: number;
  // Le jour où la rétro a été écrite, AAAA-MM-JJ.
  date: string;
};

// `origin` : d'où elle est née ; c'est celle qu'elle porte au carnet.
export type LeconHistoire = { id: string; texte: string; citations: Citation[]; origin: LessonOrigin };

export type Decision =
  // La leçon entre au carnet, promue : `retros`, les citations qui l'y portent.
  | { kind: "promote"; lesson: string; retros: string[] }
  // La leçon redevient provisoire : `retros`, sa dernière citation, après
  // laquelle personne ne l'a reconfirmée (vide : aucune).
  | { kind: "demote"; lesson: string; retros: string[] }
  // La leçon provisoire disparaît, sa sortie reste au carnet : `retros`, sa
  // dernière citation.
  | { kind: "delete"; lesson: string; retros: string[] };

export type Entree = {
  histoire: LeconHistoire[];
  carnet: Carnet;
  seuils: Seuils;
  servis: number;
  // Le jour de la décision, celui des sorties qu'elle écrit.
  aujourdhui: string;
};

export type Resultat = { decisions: Decision[]; carnet: Carnet };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// L'ordre du carnet (`carnet.ts`) : les nombres comparés comme des nombres.
function comparer(a: string, b: string): number {
  const c = a.localeCompare(b, "en", { numeric: true });
  return c !== 0 ? c : a < b ? -1 : a > b ? 1 : 0;
}

const unique = (refs: string[]) => [...new Set(refs)].sort(comparer);

// Ce que devient une leçon au fil de ses citations, jusqu'au ticket `servis`.
type Vie = {
  etat: "provisoire" | "promue" | "supprimee";
  // Le rang à partir duquel l'expiration se compte : la dernière citation, ou
  // la rétrogradation.
  depuis: number;
  // Les citations qui comptent pour la promotion : celles d'après la dernière
  // coupure (naissance, rétrogradation, suppression).
  comptees: Citation[];
  // Le jour de la citation qui l'a promue la dernière fois, sinon celui de la
  // première citation de sa vie.
  entree: string;
  // La dernière citation de la vie.
  derniere: Citation | null;
};

function ticketsDistincts(citations: Citation[]): number {
  return new Set(citations.map((c) => c.ticket)).size;
}

// Rejoue les citations d'une leçon, triées, sous les seuils. Une suppression
// n'est pas définitive dans le rejeu : une citation d'après fait naître une
// nouvelle vie, provisoire.
function rejouer(citations: Citation[], seuils: Seuils, servis: number): Vie | null {
  let vie: Vie | null = null;
  // Fait passer le temps jusqu'au rang `jusqua` : rétrogradation, puis
  // suppression, si leur heure est venue. `inclus` : l'heure `jusqua` compte
  // (la fin du rejeu) ; sinon une citation à ce rang arrive à temps.
  const vieillir = (v: Vie, jusqua: number, inclus: boolean) => {
    const echu = (point: number) => (inclus ? point <= jusqua : point < jusqua);
    if (v.etat === "promue" && echu(v.depuis + seuils.expirationPromue)) {
      v.etat = "provisoire";
      v.depuis += seuils.expirationPromue;
      v.comptees = [];
    }
    if (v.etat === "provisoire" && echu(v.depuis + seuils.expirationProvisoire)) v.etat = "supprimee";
  };
  for (const c of citations) {
    if (vie) vieillir(vie, c.servi, false);
    if (!vie || vie.etat === "supprimee") {
      vie = { etat: "provisoire", depuis: c.servi, comptees: [], entree: c.date, derniere: null };
    }
    vie.comptees.push(c);
    vie.depuis = c.servi;
    vie.derniere = c;
    if (vie.etat === "provisoire" && ticketsDistincts(vie.comptees) >= seuils.promotion) {
      vie.etat = "promue";
      vie.entree = c.date;
    }
  }
  if (vie) vieillir(vie, servis, true);
  return vie;
}

function verifier(entree: Entree): void {
  const { histoire, seuils, servis, aujourdhui } = entree;
  if (!Number.isSafeInteger(servis) || servis < 0) throw new Error(`péremption : le compte des tickets servis est un entier positif (reçu ${servis})`);
  if (!DATE.test(aujourdhui)) throw new Error(`péremption : le jour de la décision s'écrit AAAA-MM-JJ (reçu « ${aujourdhui} »)`);
  for (const [nom, valeur] of Object.entries(seuils)) {
    if (!Number.isSafeInteger(valeur) || valeur <= 0) throw new Error(`péremption : le seuil ${nom} est un entier supérieur à zéro (reçu ${valeur})`);
  }
  const vus = new Set<string>();
  for (const lecon of histoire) {
    if (vus.has(lecon.id)) throw new Error(`péremption : la leçon « ${lecon.id} » apparaît deux fois dans l'histoire`);
    vus.add(lecon.id);
    for (const c of lecon.citations) {
      if (!Number.isSafeInteger(c.servi) || c.servi < 1 || c.servi > servis) {
        throw new Error(`péremption : la citation de « ${lecon.id} » par ${c.retro} porte le rang ${c.servi}, hors des ${servis} tickets servis`);
      }
      if (!DATE.test(c.date)) throw new Error(`péremption : la citation de « ${lecon.id} » par ${c.retro} est datée « ${c.date} » (AAAA-MM-JJ)`);
    }
  }
}

// Les décisions que l'histoire impose au carnet à présent, et le carnet qui en
// résulte. Une leçon du carnet sans histoire n'est jugée que promue : sa
// dernière reconfirmation est alors le ticket servi 0.
export function decider(entree: Entree): Resultat {
  verifier(entree);
  const { seuils, servis, aujourdhui } = entree;
  const histoire = new Map(entree.histoire.map((l) => [l.id, { ...l, citations: [...l.citations].sort((a, b) => a.servi - b.servi) }]));
  const carnet = new Map(entree.carnet.lessons.map((l) => [l.id, l]));
  const ids = [...new Set([...histoire.keys(), ...carnet.keys()])].sort(comparer);

  const decisions: Decision[] = [];
  const resultat = new Map(carnet);
  const refs = (citations: Citation[]) => unique(citations.map((c) => c.retro));
  const toutes = (id: string, l: LeconHistoire | undefined) => unique([...(carnet.get(id)?.retros ?? []), ...(l?.citations ?? []).map((c) => c.retro)]);

  // L'origine qu'elle porte : celle que le carnet a déjà écrite, sinon celle
  // de sa naissance.
  const origine = (id: string, l: LeconHistoire | undefined): LessonOrigin => ({ ...(carnet.get(id)?.origin ?? l?.origin ?? RETRO_ORIGIN) });

  const promouvoir = (id: string, l: LeconHistoire, vie: Vie) => {
    decisions.push({ kind: "promote", lesson: id, retros: refs(vie.comptees) });
    resultat.set(id, { id, text: l.texte, state: "promoted", entered: vie.entree, retros: toutes(id, l), origin: origine(id, l) });
  };
  const supprimer = (id: string, texte: string, entree: string, derniere: Citation | null, l: LeconHistoire | undefined) => {
    decisions.push({ kind: "delete", lesson: id, retros: derniere ? [derniere.retro] : [] });
    resultat.set(id, { id, text: texte, state: "expired", entered: entree, retros: toutes(id, l), origin: origine(id, l), exit: { date: aujourdhui, reason: "expiry" } });
  };

  for (const id of ids) {
    const l = histoire.get(id);
    const ecrite: Lesson | undefined = carnet.get(id);

    if (ecrite?.state === "promoted") {
      // Promue : seule compte sa dernière citation, d'où court l'expiration.
      const derniere = l?.citations.at(-1) ?? null;
      const depuis = derniere?.servi ?? 0;
      if (servis - depuis < seuils.expirationPromue) continue;
      decisions.push({ kind: "demote", lesson: id, retros: derniere ? [derniere.retro] : [] });
      resultat.delete(id);
      if (servis - depuis - seuils.expirationPromue >= seuils.expirationProvisoire) supprimer(id, ecrite.text, ecrite.entered, derniere, l);
      continue;
    }

    if (!l) continue;

    if (ecrite?.exit) {
      // Sortie (retirée ou expirée) : seules comptent les citations d'après.
      const apres = l.citations.filter((c) => c.date > ecrite.exit!.date);
      const vie = rejouer(apres, seuils, servis);
      if (vie?.etat === "promue") promouvoir(id, l, vie);
      continue;
    }

    // Provisoire : toute son histoire se rejoue.
    const vie = rejouer(l.citations, seuils, servis);
    if (vie?.etat === "promue") promouvoir(id, l, vie);
    else if (vie?.etat === "supprimee") supprimer(id, l.texte, vie.entree, vie.derniere, l);
  }

  return { decisions, carnet: { lessons: [...resultat.values()].sort((a, b) => comparer(a.id, b.id)) } };
}

// L'histoire des leçons d'un projet, tirée de ses rétros dans l'ordre du
// journal (`retrosDuProjet`) : chaque ticket servi écrit la sienne, la n-ième
// rétro est donc celle du n-ième ticket servi. Les ids sont ceux que le
// journal leur a donnés (`carnetDuProjet`).
//
// Les leçons candidates — nées d'un renvoi ou d'une correction
// (`candidatesDuProjet`) — y entrent à leur rang dans le journal, comme une
// rétro, mais ne sont pas des tickets servis : le temps ne se compte qu'en
// rétros. Une candidate écrite pendant le n-ième ticket servi — après la rétro
// du précédent — compte à ce rang n, comme la rétro du ticket qu'elle suit
// fait partie de ce ticket. Tant qu'aucun ticket n'a été servi depuis, elle
// n'est pas encore comptée : sa leçon existe, provisoire, sans citation.
export function histoireDesRetros(retros: Retro[], candidates: LeconCandidate[] = []): LeconHistoire[] {
  const rang = new Map(retros.map((r, i) => [r.ref, { servi: i + 1, date: r.at.slice(0, 10) }]));
  for (const c of candidates) {
    const servi = retros.filter((r) => r.seq < c.seq).length + 1;
    if (servi <= retros.length) rang.set(c.ref, { servi, date: c.at.slice(0, 10) });
  }
  const lecons = entrelacer(retros, candidates).reduce(appliquerSource, carnetVide()).lecons;
  return lecons.map((l) => ({
    id: l.id,
    texte: l.texte,
    origin: l.origin,
    citations: l.entrees.flatMap((e) => {
      const r = rang.get(e.retro);
      return r === undefined ? [] : [{ genre: e.genre, retro: e.retro, ticket: e.ticket, ...r }];
    }),
  }));
}
