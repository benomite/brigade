// Les étapes de l'installation d'un projet sur une box préparée : une liste
// fixe, dans un ordre fixe, connue avant que la première soit lancée. Chacune
// dit à quoi elle sert, ce qui se passe si on la saute, et si elle demande un
// geste que l'app ne peut pas faire seule.
//
// Leur état a pour support le journal du projet, comme les décisions du chef :
// il survit à la fermeture de l'app et au redémarrage du runtime, et la
// reprise retrouve l'étape courante — la première qui n'est pas faite. Une
// étape jamais notée est à faire.
//
// Ce module ne fait aucune étape : il dit lesquelles existent et où elles en
// sont. Les faire revient à leurs exécuteurs ; d'ici là, le chef — ou l'app,
// pour lui — note lui-même qu'une étape est faite (`installation etapes`).
//
// Sauf la dernière : l'installation n'est terminée que sur une vérification
// verte (`terminer`), qui atteste alors chacune. Aucune ne reste à faire après,
// et aucun geste ne se découvre en démarrant.
import { existsSync } from "node:fs";
import { Base } from "./base.ts";
import type { Evenement } from "./evenements.ts";
import type { EtatDEtape } from "./events/installation.ts";
import { cheminJournal, type Journal } from "./journal.ts";

export type Etape = {
  id: string;
  titre: string;
  // À quoi elle sert, en une phrase.
  sert: string;
  // Ce qui se passe si on la saute, en une phrase.
  sauter: string;
  // Le geste que l'app ne peut pas faire à la place du chef, en une phrase —
  // nul si elle peut tout faire seule.
  geste: string | null;
};

// L'ordre est celui où le chef les fait : il ne change pas d'une lecture à
// l'autre, ni d'un projet à l'autre.
export const ETAPES: readonly Etape[] = [
  {
    id: "ajout",
    titre: "Ajouter le projet sur la box",
    sert: "La box clone le dépôt, pose l'instance du projet, sa cloison, sa sauvegarde et ses ports : c'est elle qui fait exister le projet sur la box.",
    sauter: "Le projet n'existe pas sur la box : aucune des étapes suivantes n'a où s'appliquer.",
    geste: null,
  },
  {
    id: "init",
    titre: "Amorcer le dépôt",
    sert: "`/brigade:init` pose dans le dépôt les bindings, les gates et le setup de worktree que les cooks, la station et la pass lisent.",
    sauter: "La pass n'a pas de gates à jouer ni la station de setup à lancer : aucun cook ne peut livrer.",
    geste: "Taper `/brigade:init` dans la session que l'app ouvre, puis merger sa PR sur la branche d'intégration : l'app ne converse pas et ne merge pas à ta place.",
  },
  {
    id: "verification",
    titre: "Vérifier la box",
    sert: "Dit d'un coup tout ce qui manque au projet pour être servi — sur la box, dans le dépôt, sur GitHub — avec le geste qui le pose.",
    sauter: "Ce qui manque se découvre en démarrant, une panne à la fois : un cook qui ne part pas, une commande introuvable.",
    geste: null,
  },
  {
    id: "stations",
    titre: "Déclarer les stations",
    sert: "Choisit, parmi les stations que la machine fournit, celles où les tickets se servent et combien de cooks chacune fait tourner à la fois — posées au journal du projet, sans `sudo` ni drop-in.",
    sauter: "La cuisine démarre, mais aucun cook ne part : sans station, aucun ticket n'est servi.",
    geste: null,
  },
  {
    id: "protection",
    titre: "Protéger la branche d'intégration",
    sert: "Sur GitHub, plus rien n'entre dans la branche d'intégration que par une PR, et la push protection refuse une livraison qui porterait des identifiants.",
    sauter: "Un push direct entre dans la branche d'intégration sans passer par la pass, et des identifiants peuvent partir sur GitHub.",
    geste: null,
  },
  {
    id: "decisions",
    titre: "Poser les décisions que le démarrage réclame",
    sert: "Pose, chacune avec sa question, ses options et leur effet, les décisions que la configuration du projet suffit à trancher — le calibrage du manager et du reviewer, que le démarrage réclame, puis les seuils de coût et le closer —, au journal du projet, sans `sudo` ni drop-in.",
    sauter: "Le runtime refuse de démarrer : sans le calibrage du manager et du reviewer, rien n'est jugé ni relu.",
    geste: null,
  },
  {
    id: "demarrage",
    titre: "Démarrer la cuisine",
    sert: "Lance le runtime du projet : il lit le rail et envoie un cook sur le premier ticket prêt.",
    sauter: "Tout est prêt et rien ne tourne : aucun ticket n'est servi.",
    geste: null,
  },
];

export const estUneEtape = (id: string): boolean => ETAPES.some((etape) => etape.id === id);

const NOTEE = "installation.step";

// L'état de chaque étape que le journal porte : la dernière note de chacune.
// Une étape que ce runtime ne connaît pas — notée par une version plus récente
// — est ignorée.
export function etatsNotes(base: Base): Map<string, EtatDEtape> {
  const etats = new Map<string, EtatDEtape>();
  for (const { payload } of base.lire<{ payload: string }>("SELECT payload FROM events WHERE type = ? ORDER BY seq", NOTEE)) {
    const { step, state } = JSON.parse(payload) as { step?: unknown; state?: unknown };
    if (typeof step !== "string" || !estUneEtape(step)) continue;
    if (state === "todo" || state === "done" || state === "waiting") etats.set(step, state);
  }
  return etats;
}

export type EtapeLue = Etape & { etat: EtatDEtape };

export type Installation = {
  // Toutes les étapes, dans leur ordre.
  etapes: EtapeLue[];
  // La première étape qui n'est pas faite, ou null : toutes le sont.
  courante: string | null;
};

export function lireInstallation(etats: Map<string, EtatDEtape>): Installation {
  const etapes = ETAPES.map((etape) => ({ ...etape, etat: etats.get(etape.id) ?? ("todo" as const) }));
  return { etapes, courante: etapes.find((etape) => etape.etat !== "done")?.id ?? null };
}

// L'installation telle que le journal du répertoire d'état la porte, en
// lecture seule. Aucun journal : rien n'a été noté, tout est à faire — et
// aucun journal n'est créé pour le dire.
export function installationDe(repertoireEtat: string): Installation {
  const chemin = cheminJournal(repertoireEtat);
  if (!existsSync(chemin)) return lireInstallation(new Map());
  const base = new Base(chemin, { lectureSeule: true, attenteMs: 5000 });
  try {
    return lireInstallation(etatsNotes(base));
  } finally {
    base.fermer();
  }
}

// Note l'état d'une étape, au nom de `auteur`. Rend le fait écrit, ou null si
// elle en était déjà là. N'écrit que le journal, et ne fait rien de l'étape.
export function noterEtape(journal: Journal, note: { projet: string; etape: string; etat: EtatDEtape; auteur: string }): Evenement | null {
  if (!estUneEtape(note.etape)) throw new Error(`« ${note.etape} » n'est pas une étape de l'installation — attendu ${ETAPES.map((etape) => etape.id).join(", ")}`);
  return journal.base.transaction(() => {
    const previous = etatsNotes(journal.base).get(note.etape) ?? "todo";
    if (previous === note.etat) return null;
    return journal.ajouter({ project: note.projet, ticket: null, author: note.auteur, type: NOTEE, payload: { step: note.etape, state: note.etat, previous } });
  });
}

// L'étape qui termine l'installation : notée faite, la cuisine est prête à
// servir. Elle ne se note que par `terminer`.
export const DERNIERE = ETAPES[ETAPES.length - 1]?.id ?? "";

export type Fin = { terminee: true; notees: string[] } | { terminee: false; remises: string[] };

// Termine l'installation sur ce que la vérification vient de dire.
// `aReprendre` : les étapes que ses manques nomment. Vide, « Vérifier » est
// vert et atteste chaque étape : toutes sont notées faites ensemble, la
// dernière comprise — l'installation est terminée, aucune ne reste à faire.
// Sinon rien n'est terminé : celles que la vérification nomme et que le
// journal portait faites, et la dernière si elle l'était, sont remises à faire
// — la liste ne dit pas fait ce qui ne l'est plus. N'écrit que le journal.
export function terminer(journal: Journal, fin: { projet: string; aReprendre: string[]; auteur: string }): Fin {
  const { projet, auteur } = fin;
  return journal.base.transaction(() => {
    if (fin.aReprendre.length === 0) {
      const notees = ETAPES.filter(({ id }) => noterEtape(journal, { projet, etape: id, etat: "done", auteur }) !== null).map(({ id }) => id);
      return { terminee: true, notees };
    }
    const etats = etatsNotes(journal.base);
    const remises = ETAPES.map(({ id }) => id).filter((id) => (fin.aReprendre.includes(id) || id === DERNIERE) && etats.get(id) === "done");
    for (const etape of remises) noterEtape(journal, { projet, etape, etat: "todo", auteur });
    return { terminee: false, remises };
  });
}
