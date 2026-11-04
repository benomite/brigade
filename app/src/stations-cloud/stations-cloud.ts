// Les stations cloud d'un projet, telles que l'app les lit (#2232, épique #2223) : ce que l'onglet Cooks en montre —
// combien sont ajoutées, ses plafonds, ce qu'une station reçoit et si le chef l'a approuvé, ce qu'elles coûtent par
// ticket servi. L'app ne décide de rien : elle lit les formes du runtime, sans rien croire sur parole, et lui rend ce que
// le chef a saisi.
//   plafonds          runtime/src/stations-cloud/plafonds.ts (#2228)       — `Plafonds`
//   coût par ticket   runtime/src/stations-cloud-cout/ (#2230)             — `CoutDuProjet`
//   ce qu'elle reçoit runtime/src/stations-cloud-secrets/ (#2231)          — la liste lisible, et son approbation
// Aucune commande du runtime ne les publie encore : le pont de l'app ne les offre pas (vue/pont.d.ts), et l'onglet
// Cooks ne pose son bloc que le jour où il les offre (vue/stations-cloud/). Ce module est la lecture qu'il fera alors.

// Les plafonds d'un projet : un plafond absent ne borne rien ; sans aucun, rien ne démarre (plafonds.ts).
export type Plafonds = {
  aLaFois?: number;
  heuresParJour?: number;
  heuresParMois?: number;
};

// Le coût du projet sur la période : « n/a » tant qu'aucun ticket n'est servi (stations-cloud-cout.ts).
export type CoutDuProjet = {
  projet: string;
  coutTotal: number;
  ticketsServis: number;
  coutParTicket: number | "n/a";
};

// Ce qu'une station reçoit, et ce qu'elle ne reçoit jamais (stations-cloud-secrets/, `Liste`) : chaque élément a son nom
// dans la charge utile, `cle`, et ce que l'écran en dit, `dit` — le seul texte que la vue montre.
export type Element = { cle: string; dit: string };
export type CeQuElleRecoit = {
  recoit: Element[];
  jamais: Element[];
};

// Ce que la vue reçoit pour un projet. `approuvee` : le chef a approuvé la liste telle qu'elle est — une liste changée
// la redemande. `periode` : ce que couvre le coût, en mots (« this month »).
export type VuDuCloud = {
  projet: string;
  ajoutees: number;
  plafonds: Plafonds;
  recoit: CeQuElleRecoit;
  approuvee: boolean;
  cout: CoutDuProjet;
  periode: string;
};

// Ce que la vue renvoie quand le chef ajoute une station : ses plafonds, et, la première fois, son approbation.
export type AjoutCloud = { plafonds: Plafonds; approuver: boolean };
export type CloudAjoute = { fait: string } | { refus: string; detail?: string };

type Lu = Record<string, unknown>;
const objet = (valeur: unknown): valeur is Lu => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const chaine = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur.trim() !== "";
const elements = (valeur: unknown): valeur is Element[] => Array.isArray(valeur) && valeur.every((element) => objet(element) && chaine(element.cle) && chaine(element.dit));
const nombre = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0;

const BORNES = ["aLaFois", "heuresParJour", "heuresParMois"] as const;

// Les plafonds tels que le runtime les tient : chacun absent, ou un nombre positif.
export function lirePlafonds(valeur: unknown): Plafonds | undefined {
  if (!objet(valeur)) return undefined;
  const plafonds: Plafonds = {};
  for (const borne of BORNES) {
    const tenue = valeur[borne];
    if (tenue === undefined || tenue === null) continue;
    if (!nombre(tenue)) return undefined;
    plafonds[borne] = tenue;
  }
  return plafonds;
}

export function lireCout(valeur: unknown): CoutDuProjet | undefined {
  if (!objet(valeur)) return undefined;
  const { projet, coutTotal, ticketsServis, coutParTicket } = valeur;
  if (!chaine(projet) || !nombre(coutTotal) || !nombre(ticketsServis) || !Number.isInteger(ticketsServis)) return undefined;
  // Sans ticket servi, il n'y a pas de coût par ticket, quoi que la forme en dise.
  if (ticketsServis === 0) return { projet, coutTotal, ticketsServis, coutParTicket: "n/a" };
  if (!nombre(coutParTicket)) return undefined;
  return { projet, coutTotal, ticketsServis, coutParTicket };
}

// Ce qu'une station reçoit : une liste vide ne s'approuve pas — l'écran n'aurait rien à montrer avant l'approbation.
export function lireCeQuElleRecoit(valeur: unknown): CeQuElleRecoit | undefined {
  if (!objet(valeur) || !elements(valeur.recoit) || valeur.recoit.length === 0 || !elements(valeur.jamais)) return undefined;
  const copie = (liste: Element[]) => liste.map(({ cle, dit }) => ({ cle, dit }));
  return { recoit: copie(valeur.recoit), jamais: copie(valeur.jamais) };
}

// La lecture d'un projet, d'une sortie JSON : `undefined` dès qu'une forme n'est pas celle du runtime.
export function lireLeCloud(sortie: string): VuDuCloud | undefined {
  let lu: unknown;
  try {
    lu = JSON.parse(sortie);
  } catch {
    return undefined;
  }
  if (!objet(lu)) return undefined;
  const { projet, ajoutees, approuvee, periode } = lu;
  const plafonds = lirePlafonds(lu.plafonds);
  const recoit = lireCeQuElleRecoit(lu.recoit);
  const cout = lireCout(lu.cout);
  if (!chaine(projet) || !nombre(ajoutees) || !Number.isInteger(ajoutees) || typeof approuvee !== "boolean" || !chaine(periode)) return undefined;
  if (plafonds === undefined || recoit === undefined || cout === undefined || cout.projet !== projet) return undefined;
  return { projet, ajoutees, plafonds, recoit, approuvee, cout, periode };
}
