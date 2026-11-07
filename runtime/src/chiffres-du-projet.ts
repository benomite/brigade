// Les quatre chiffres du projet (épique #2659, #2672), dits pareil par `status`, la bande du
// rail et l'onglet Health : le temps perdu, la cuisson contre l'estimation, la part livrée du
// premier coup et les réparations de la base par PR mergée. Rien n'est calculé ici : chaque
// valeur vient de sa fonction (`temps-max/mesure.ts`, `alerte-temps-cuisson/alerte.ts`,
// `mesure-qualite.ts`) ; ce module les met en mots, avec leur seuil, leur état rouge et ce qui
// pèse le plus. La station les publie avec les temps des tickets (`temps.chiffres`), l'app les
// relaie telles quelles.
import { medianeDesRatios, lireRatios, plusAuDessus, seuilDuProjet as seuilDuRatio, type RatioServi } from "./alerte-temps-cuisson/alerte.ts";
import { ouvrirJournal } from "./journal.ts";
import { mesurerQualite, projetDuClone, qualitesDuJournal, REPARATIONS_PAR_MERGE_MAX, type Compte, type QualiteDuTicket } from "./mesure-qualite.ts";
import { centile } from "./temps-ticket/mesure.ts";
import { mediane } from "./temps-ticket/synthese.ts";
import { lesTempsDesTickets, type TempsTicket } from "./temps-ticket/ligne-status.ts";
import { seuilDuProjet as seuilPerdu, tempsPerdu, ticketsRecents } from "./temps-max/mesure.ts";

export const CHIFFRES_NOMMES = 5;

export type Chiffre = {
  cle: "perdu" | "estimation" | "premier-coup" | "reparations";
  // Le nom court de la ligne.
  nom: string;
  // La valeur, en clair ; « no data yet » quand rien ne la donne : ni un blanc ni un zéro.
  valeur: string;
  seuil: string;
  depasse: boolean;
  // Ce qui pèse le plus, une ligne chacun, pour le survol.
  pesent: string[];
};

export type EntreesDesChiffres = {
  enregistrements: readonly TempsTicket[];
  qualites: ReadonlyMap<number, QualiteDuTicket>;
  ratios: readonly RatioServi[];
  // Le contenu déjà lu de projet.json.
  projet: unknown;
};

export const SANS_DONNEE = "no data yet";

const dixiemes = (secondes: number) => `${Math.round(secondes / 6) / 10} min`;
const pourcent = (part: number) => `${Math.round(part * 100)}%`;
const fois = (ratio: number) => `×${ratio.toFixed(2)}`;
const comptes = (liste: readonly Compte[]) => liste.slice(0, CHIFFRES_NOMMES).map(({ nom, fois: n }) => `${nom} (${n})`);

export function chiffresDuProjet({ enregistrements, qualites, ratios, projet }: EntreesDesChiffres): Chiffre[] {
  const recents = ticketsRecents(enregistrements);
  const seuilMin = seuilPerdu(projet);
  const perdus = recents.map(tempsPerdu);
  const perdu: Chiffre =
    recents.length === 0
      ? { cle: "perdu", nom: "lost time", valeur: SANS_DONNEE, seuil: `${seuilMin} min`, depasse: false, pesent: [] }
      : (() => {
          const med = mediane(perdus);
          return {
            cle: "perdu" as const,
            nom: "lost time",
            valeur: `${dixiemes(med)} median, ${dixiemes(centile(perdus, 0.75))} p75`,
            seuil: `${seuilMin} min`,
            depasse: med > seuilMin * 60,
            pesent: recents
              .map((t, rang) => ({ t, rang, p: tempsPerdu(t) }))
              .sort((a, b) => b.p - a.p || a.rang - b.rang)
              .slice(0, CHIFFRES_NOMMES)
              .map(({ t, p }) => `#${t.ticket} lost ${dixiemes(p)}`),
          };
        })();

  const seuilRatio = seuilDuRatio(projet);
  const ratio = medianeDesRatios(ratios);
  const estimation: Chiffre = {
    cle: "estimation",
    nom: "vs estimate",
    valeur: ratio === null ? SANS_DONNEE : `${fois(ratio)} median`,
    seuil: fois(seuilRatio),
    depasse: ratio !== null && ratio > seuilRatio,
    pesent: plusAuDessus(ratios).map((r) => `#${r.ticket} ${fois(r.ratio)} (${Math.round(r.reel)} min against ${Math.round(r.attendu)})`),
  };

  const q = mesurerQualite(enregistrements, qualites, projet);
  const premierCoup: Chiffre = {
    cle: "premier-coup",
    nom: "first try",
    valeur: q.premierCoup === null ? SANS_DONNEE : pourcent(q.premierCoup),
    seuil: `${q.seuilPremierCoup}%`,
    depasse: q.sousLeSeuil === true,
    pesent: comptes(q.motifsDeRenvoi),
  };
  const reparations: Chiffre = {
    cle: "reparations",
    nom: "main repairs",
    valeur: q.reparationsParMerge === null ? SANS_DONNEE : `${q.reparationsParMerge.toFixed(3)} per merge`,
    seuil: `${REPARATIONS_PAR_MERGE_MAX} per merge`,
    depasse: q.tropDeReparations === true,
    pesent: comptes(q.checksCasses),
  };
  return [perdu, estimation, premierCoup, reparations];
}

// Ce que le journal du projet sait de la qualité de ses tickets ; rien s'il ne se lit pas.
export function qualitesDuRepertoire(repertoireEtat: string | undefined): Map<number, QualiteDuTicket> {
  if (!repertoireEtat) return new Map();
  let journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  } catch {
    return new Map();
  }
  try {
    return qualitesDuJournal(journal.base);
  } catch {
    return new Map();
  } finally {
    journal.fermer();
  }
}

// Les quatre chiffres du clone d'un projet, lus de `.claude/brigade/` et des qualités données.
export function chiffresDuClone(clone: string | undefined, qualites: ReadonlyMap<number, QualiteDuTicket>): Chiffre[] {
  let ratios: RatioServi[] = [];
  try {
    ratios = clone ? lireRatios(clone) : [];
  } catch {}
  return chiffresDuProjet({ enregistrements: lesTempsDesTickets(clone).enregistrements, qualites, ratios, projet: clone ? projetDuClone(clone) : null });
}

const ROUGE = "\u001b[31m";
const FIN_ROUGE = "\u001b[0m";

// Une ligne par chiffre : `lost time   3.5 min median, 6 min p75 / 2 min` ; en rouge au-dessus du seuil.
export function direLesChiffres(chiffres: readonly Chiffre[], rouge = false): string[] {
  return chiffres.map((c) => {
    const texte = `${c.nom.padEnd(12)} ${c.valeur} / ${c.seuil}`;
    return rouge && c.depasse ? `${ROUGE}${texte}${FIN_ROUGE}` : texte;
  });
}
