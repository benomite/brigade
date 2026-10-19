// D'un domaine relevé par la mesure (`domaines.ts`), une proposition de profil
// de cook, posée au journal (`profile.proposed`) pour que la file la montre :
// son nom, le domaine, les chiffres qui la justifient — avec ses tickets —, et
// ce que le profil contiendrait : des skills, un périmètre (la zone) et un
// carnet qui part des leçons du domaine. Rien n'est écrit dans le dépôt : seul
// le « oui » du chef le fait (`decision.ts`).
//
// Les leçons d'un domaine sont les leçons promues du carnet du projet
// (`carnet/carnet.ts`) dont une rétro nomme un ticket servi dans cette zone
// (`#12`). Les skills partent vides : rien de ce que le journal porte ne dit
// lesquelles un domaine demande, et le chef les écrit dans la définition.
//
// Un domaine n'est pas proposé :
// - tant qu'une proposition pour sa zone attend le chef ;
// - quand son profil existe — accepté, ou déjà défini dans le dépôt ;
// - après un « non », tant qu'il ne franchit pas de nouveau les seuils sur des
//   tickets que le « non » ne nommait pas : la mesure est refaite comme si ces
//   tickets-là ne portaient pas la zone. Les mêmes tickets, relevés à nouveau,
//   ne la refont pas.
import { readCarnet, type Lesson } from "../carnet/carnet.ts";
import type { Evenement } from "../evenements.ts";
import type { Journal } from "../journal.ts";
import { definitionExiste, nomDuProfil } from "./definition.ts";
import { normaliser, releverLesDomaines, ticketsServis, type Domaine, type ReleveDesDomaines, type TicketServi } from "./domaines.ts";
import type { PropositionDeProfil } from "./evenements.ts";
import type { ReglagesDesProfils } from "./reglages.ts";

export type Proposee = Extract<Evenement, { type: "profile.proposed" }>;
type Acceptee = Extract<Evenement, { type: "profile.accepted" }>;
type Refusee = Extract<Evenement, { type: "profile.refused" }>;

const TOUS = Number.MAX_SAFE_INTEGER;

// Les tickets servis qui portent la zone, tous ceux que le journal connaît,
// chacun une fois, dans l'ordre de leur premier service.
export function ticketsDuDomaine(servis: readonly TicketServi[], zone: string): number[] {
  return [...new Set(servis.filter((servi) => servi.zone.some((chemin) => normaliser(chemin) === zone)).map(({ ticket }) => ticket))];
}

// Les leçons promues dont une rétro nomme l'un de ces tickets.
export function leconsDuDomaine(lecons: readonly Lesson[], tickets: readonly number[]): Lesson[] {
  const siens = new Set(tickets.map((ticket) => `#${ticket}`));
  return lecons.filter((lecon) => lecon.state === "promoted" && lecon.retros.some((retro) => siens.has(retro)));
}

// La proposition d'un domaine relevé. Une fonction pure.
export function proposition(domaine: Domaine, releve: ReleveDesDomaines, lecons: readonly Lesson[]): PropositionDeProfil {
  return {
    name: nomDuProfil(domaine.zone),
    zone: domaine.zone,
    tickets: domaine.tickets,
    window: releve.servis,
    zoneFirstTry: { first: domaine.premiers, merged: domaine.retenus },
    projectFirstTry: { first: releve.premiers, merged: releve.retenus },
    gap: domaine.ecart,
    settings: { window: releve.reglages.fenetre, minTickets: releve.reglages.tickets, gapPoints: releve.reglages.ecart },
    skills: [],
    perimeter: [domaine.zone],
    notebook: [...lecons],
  };
}

// Les tickets servis, comme si ceux que le « non » nommait ne portaient pas la
// zone : ils restent dans la fenêtre et dans la moyenne du projet.
function sansLesVus(servis: readonly TicketServi[], zone: string, vus: ReadonlySet<number>): TicketServi[] {
  return servis.map((servi) => (vus.has(servi.ticket) ? { ...servi, zone: servi.zone.filter((chemin) => normaliser(chemin) !== zone) } : servi));
}

// Les propositions qui attendent le chef : ni acceptées, ni refusées.
export function propositionsEnAttente(journal: Journal): Proposee[] {
  const tranchees = new Set([...journal.duType("profile.accepted", TOUS), ...journal.duType("profile.refused", TOUS)].map(({ payload }) => payload.proposal));
  return journal.duType("profile.proposed", TOUS).filter(({ seq }) => !tranchees.has(seq));
}

// Ce qui retient la zone d'être proposée : `true`, ou le dernier « non » que
// les tickets neufs dépassent — c'est lui que la clé d'unicité nomme —, ou
// `false` si rien ne la retient.
function retenue(zone: string, attente: readonly Proposee[], acceptes: readonly Acceptee[], refus: readonly Refusee[], servis: readonly TicketServi[], reglages: ReglagesDesProfils): boolean | Refusee {
  if (attente.some(({ payload }) => payload.zone === zone)) return true;
  if (acceptes.some(({ payload }) => payload.zone === zone)) return true;
  const dernier = refus.findLast(({ payload }) => payload.zone === zone);
  if (dernier === undefined) return false;
  const neufs = releverLesDomaines(sansLesVus(servis, zone, new Set(dernier.payload.tickets)), reglages);
  return neufs.domaines.some((domaine) => domaine.zone === zone) ? dernier : true;
}

export type OptionsDesPropositions = {
  journal: Journal;
  projet: string;
  reglages: ReglagesDesProfils;
  // Le dépôt du projet : son carnet, et les profils qu'il définit déjà.
  repoDir: string;
};

// Relève les domaines du journal et pose une proposition pour chacun de ceux
// que rien ne retient. Rend celles écrites par ce relevé — aucune s'il n'y a
// rien de neuf. Un carnet illisible fait lever (`CarnetError`) : un carnet de
// départ ne se devine pas.
export function proposerLesProfils({ journal, projet, reglages, repoDir }: OptionsDesPropositions): Proposee[] {
  const servis = ticketsServis(journal.base);
  const releve = releverLesDomaines(servis, reglages);
  if (releve.domaines.length === 0) return [];
  const attente = propositionsEnAttente(journal);
  const acceptes = journal.duType("profile.accepted", TOUS);
  const refus = journal.duType("profile.refused", TOUS);
  const { lessons } = readCarnet(repoDir);
  const ecrites: Proposee[] = [];
  for (const domaine of releve.domaines) {
    if (definitionExiste(repoDir, nomDuProfil(domaine.zone))) continue;
    const motif = retenue(domaine.zone, attente, acceptes, refus, servis, reglages);
    if (motif === true) continue;
    const ecrite = journal.ajouter({
      project: projet,
      ticket: null,
      author: "runtime",
      type: "profile.proposed",
      payload: proposition(domaine, releve, leconsDuDomaine(lessons, ticketsDuDomaine(servis, domaine.zone))),
      dedupKey: `profile.proposed:${domaine.zone}${motif === false ? "" : `:after:${motif.seq}`}`,
    });
    if (ecrite !== null) ecrites.push(ecrite as Proposee);
  }
  return ecrites;
}
