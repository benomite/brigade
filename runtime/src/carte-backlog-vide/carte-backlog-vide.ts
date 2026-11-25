// La carte du backlog vide (#4225, épique #4131 ; règle 3 du processus simplifié,
// docs/superpowers/specs/2026-11-24-simplified-process.md) : quand plus aucune issue
// ouverte n'est à cuire — toutes sont des `idea`, parquées, servies ou absentes —, le
// manager le dit au chef par une seule carte. Les tours suivants dans le même état n'en
// posent pas d'autre ; une issue redevenue cuisinable réarme la carte, et le backlog vide
// de nouveau en pose une nouvelle.
//
// `creerCarteBacklogVide` est la règle, sans E/S ; carte-du-journal.ts la branche sur la
// porte de TODO, et le tour du manager (manager.ts) la sert à chaque lecture du backlog.
import { estParque } from "../github-etat/etats.ts";
import { estMisDeCote } from "../github.ts";

// Une issue ouverte du backlog, telle que le tour du manager la lit.
export type IssueDuBacklog = { number: number; labels: readonly string[] };

// Le label d'une idée en réserve : jamais cuite (#3536).
const IDEE = "idea";

// Une issue que le manager peut cuire : ni une idée, ni parquée (`estParque`, règle 13), ni hors de cette cuisine.
const cuisinable = ({ labels }: IssueDuBacklog): boolean => !labels.includes(IDEE) && !estParque(labels) && !estMisDeCote(labels);

// Ce que la carte dit au chef, dans les mots du glossaire.
const TEXTE_BACKLOG_VIDE = "Nothing is left to cook: every open issue in the backlog is an idea or parked, or none is open.";

type OptionsCarteBacklogVide = {
  // Pose la carte devant le chef. Si elle lève, rien n'est tenu pour envoyé : le tour suivant la repose.
  envoyer: (texte: string) => void;
  // Une issue est de nouveau cuisinable après une carte : elle n'est plus vraie.
  retirer?: () => void;
  // La carte est déjà devant le chef au démarrage (relu du journal).
  envoyee?: boolean;
};

type CarteBacklogVide = { boucle: (backlog: readonly IssueDuBacklog[]) => void };

// La règle : une carte par backlog vide, à chaque tour du manager qui lit les issues ouvertes.
export function creerCarteBacklogVide({ envoyer, retirer = () => {}, envoyee = false }: OptionsCarteBacklogVide): CarteBacklogVide {
  let posee = envoyee;
  return {
    boucle(backlog) {
      if (backlog.some(cuisinable)) {
        if (posee) {
          posee = false;
          retirer();
        }
        return;
      }
      if (posee) return;
      envoyer(TEXTE_BACKLOG_VIDE);
      posee = true;
    },
  };
}
