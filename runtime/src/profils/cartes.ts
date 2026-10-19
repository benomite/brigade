// Les profils proposés qui attendent le chef, dans la forme qu'une carte de la
// file du projet dessine : le nom, le domaine, les chiffres qui le justifient
// — chaque ticket avec l'adresse de son issue —, et ce que le profil
// contiendrait. C'est `facts` qui les porte (`faits.ts`) : l'app n'y déduit
// rien. Une proposition tranchée — « oui » ou « non » (`decision.ts`) — quitte
// la file.
import { DEPOT_GITHUB } from "../etat.ts";
import type { Journal } from "../journal.ts";
import type { PartDuPremierCoup } from "./evenements.ts";
import { propositionsEnAttente } from "./proposer.ts";

// Une part livrée du premier coup : `premiers` sur `retenus` mergés, et
// `part` entre 0 et 1.
export type Part = { premiers: number; retenus: number; part: number };

// `proposition` : le fait qui la porte, par son `seq` — ce que le « oui » ou le
// « non » du chef nommera. `chiffres` : `tickets`, ceux de la fenêtre qui
// portent le domaine (chacun avec `url`, nulle quand la box ne connaît pas
// son dépôt) ; `fenetre`, les tickets servis regardés ; `domaine` et `projet`,
// leurs parts livrées du premier coup ; `ecart`, les points qui les séparent ;
// `seuils`, les réglages qui ont fait la proposition. `carnet` : les leçons
// de départ, par leur identifiant, leur texte et les rétros qui les portent.
export type CarteDeProfil = {
  proposition: number;
  nom: string;
  domaine: string;
  chiffres: {
    tickets: Array<{ ticket: number; url: string | null }>;
    fenetre: number;
    domaine: Part;
    projet: Part;
    ecart: number;
    seuils: { fenetre: number; tickets: number; ecart: number };
  };
  skills: string[];
  perimetre: string[];
  carnet: Array<{ id: string; texte: string; retros: string[] }>;
  proposee: string;
};

const part = ({ first, merged }: PartDuPremierCoup): Part => ({ premiers: first, retenus: merged, part: merged === 0 ? 0 : first / merged });

// Les profils proposés qui attendent le chef, le plus ancien d'abord.
export function cartesDeProfil(journal: Journal, depot?: string): CarteDeProfil[] {
  const adresse = (ticket: number) => (depot !== undefined && DEPOT_GITHUB.test(depot) ? `https://github.com/${depot}/issues/${ticket}` : null);
  return propositionsEnAttente(journal).map(({ seq, at, payload }) => ({
    proposition: seq,
    nom: payload.name,
    domaine: payload.zone,
    chiffres: {
      tickets: payload.tickets.map((ticket) => ({ ticket, url: adresse(ticket) })),
      fenetre: payload.window,
      domaine: part(payload.zoneFirstTry),
      projet: part(payload.projectFirstTry),
      ecart: payload.gap,
      seuils: { fenetre: payload.settings.window, tickets: payload.settings.minTickets, ecart: payload.settings.gapPoints },
    },
    skills: payload.skills,
    perimetre: payload.perimeter,
    carnet: payload.notebook.map(({ id, text, retros }) => ({ id, texte: text, retros })),
    proposee: at,
  }));
}
