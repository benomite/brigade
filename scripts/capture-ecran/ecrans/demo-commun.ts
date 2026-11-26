// L'histoire d'un seul ticket pour la vidéo de démonstration (ticket 2875, épique 1546) : #21 « L'export du journal »,
// sur un seul projet, « parade ». Chaque étape de sa vie est un rendu de la box, mot pour mot : sur le rail, pris par un
// cook, une question de produit pour le chef, repris par le cook, servi. Les écrans `demo-*.ts` ne font que les ouvrir.
import type { Activite, Faits } from "../../../app/src/faits.ts";
import type { Terminal } from "../../../app/src/terminaux.ts";
import { configuration, cuisine, demarrage, type Donnees, type Etape, MAINTENANT, type Rendu } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const BASE = RENDUS.parade as Rendu;
const TITRE = "L'export du journal";
const ISSUE = "https://github.com/chef/parade/issues/21";
const PR = "https://github.com/chef/parade/pull/24";
const COOK = { ticket: 21, titre: TITRE, station: "box/claude" };
export const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const ECRAN_DU_SECOND_AU_REPOS = ["\x1b[1msecond · parade\x1b[0m", "", "\x1b[2m> \x1b[0m"].join("\r\n");
export const PARADE_SEUL = [PROJETS[0]!];
export const OUVRIR_PARADE: Etape = { cliquer: '#projets > button[title^="parade — "]' };

const PRODUIT = {
  type: "product",
  question: "One journal export per project, or a single one for all projects?",
  choix: [
    { texte: "One per project: each project keeps its own file.", suite: "resume" },
    { texte: "A single export, all projects together.", suite: "resume" },
  ],
  captures: null,
};

const ligne = (etat: string) => `  #21  ${etat}  ${TITRE}`;
const status = (rail: string, lignes: string[], attend: string[] = [], cooks = "none running") =>
  ["project    parade", "kitchen    open", "", ...attend, rail, ...lignes, "", `cooks      ${cooks}`, ""].join("\n");

const faits = (surcharge: Partial<Faits>, compteurs: Partial<Faits["compteurs"]>): Faits =>
  ({ ...BASE.facts, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0, ...compteurs }, rail: [], cooks: [], attend: [], livres: [], ...surcharge }) as Faits;

const evenement = (type: string, at: string) => ({ seq: 100, at, type, ticket: 21 });
const carte = (etat: string, activite: Activite | null = null) => ({ ticket: 21, etat, titre: TITRE, url: ISSUE, activite, attente: null });
const depuis = "2026-10-13T10:02:11.000Z";

// Sur le rail, une minute après son arrivée.
export const EN_ATTENTE: Rendu = { ...BASE, facts: faits({ rail: [carte("en attente")], dernierEvenement: evenement("ticket.queued", "2026-10-13T10:03:12.000Z") }, { rail: 1 }), status: status("rail       1 queued", [ligne("queued  -  since 1 min")]) };

// Pris par le cook de la box, qui écrit.
export const PRIS: Rendu = {
  ...BASE,
  facts: faits({ rail: [carte("pris", { fait: "écrit", faitEn: "writing", cible: "app/src/export.ts", depuis })], cooks: [COOK], dernierEvenement: evenement("ticket.taken", "2026-10-13T10:02:11.000Z") }, { rail: 1, auTravail: 1 }),
  status: status("rail       1 taken", [ligne("taken  -  by box/claude since 2 min, lease 28 min left")], [], "1 running"),
};

// Repris par le cook une fois la réponse du chef jouée : il lance les tests.
export const REPRIS: Rendu = {
  ...BASE,
  facts: faits({ rail: [carte("pris", { fait: "teste", faitEn: "running tests", cible: "app/test", depuis })], cooks: [COOK], dernierEvenement: evenement("ticket.taken", "2026-10-13T10:03:02.000Z") }, { rail: 1, auTravail: 1 }),
  status: status("rail       1 taken", [ligne("taken  -  by box/claude since 1 min, lease 29 min left")], [], "1 running"),
};

// La question de produit qui attend le chef.
export const QUESTION: Rendu = {
  ...BASE,
  facts: faits(
    { rail: [carte("en attente")], dernierEvenement: evenement("ticket.queued", "2026-10-13T09:04:12.000Z"), attend: [{ ticket: 21, titre: TITRE, url: ISSUE, decision: { quoi: "carte", motif: "product", cause: PRODUIT.question, pr: null }, carte: PRODUIT }] } as Partial<Faits>,
    { rail: 1, attend: 1 },
  ),
  status: status(
    "rail       1 queued",
    [ligne("queued  -  since 1 h")],
    ["attend     1 décision attend le chef depuis 1 h", `  #21  depuis 1 h  produit : ${PRODUIT.question} — choix : 1. ${PRODUIT.choix[0]?.texte} · 2. ${PRODUIT.choix[1]?.texte}`, "fin attend", ""],
  ),
};

// Rien encore sur le rail : le ticket n'existe pas, le second le propose.
export const VIDE: Rendu = { ...BASE, facts: faits({ dernierEvenement: null } as Partial<Faits>, {}), status: status("rail       empty", []) };

// Servi : mergé par la pass, une demi-heure plus tard.
export const SERVI: Rendu = {
  ...BASE,
  facts: faits(
    { dernierEvenement: evenement("merge.done", "2026-10-13T10:03:58.000Z"), livres: [{ ticket: 21, titre: TITRE, url: ISSUE, livre: "2026-10-13T10:03:58.000Z", station: "box/claude", pr: PR, relecture: { resume: "Le journal s'exporte par projet, dans un fichier à lui.", constats: [] } }] } as Partial<Faits>,
    { livres24h: 1 },
  ),
  status: status("rail       empty", []),
};

// Les données d'un écran de la démo : un seul projet, `parade`, lu dans ce rendu.
export function donneesDe(rendu: Rendu, reponses: Record<string, unknown> = {}): Donnees {
  const envois = cuisine({ parade: rendu });
  return {
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PARADE_SEUL)), espace: [SECOND], ...reponses },
    // Le terminal du second, au repos : son invite, rien d'autre.
    envois: { ...envois, regarder: { ...envois.regarder, parade: [...(envois.regarder.parade ?? []), { sur: "surSortie", args: [SECOND.id, ECRAN_DU_SECOND_AU_REPOS] }] } },
  };
}
