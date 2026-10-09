// Ce qu'un process dit, masqué avant d'être écrit : ligne à ligne, pour
// qu'une valeur coupée entre deux morceaux du tube n'échappe pas au masque.
// Ce qui n'a pas encore son saut de ligne attend le suivant, ou la fin — dans
// une limite : une sortie sans saut de ligne (une progression en `\r`, un
// binaire) ne grossit pas en mémoire jusqu'à la mort du process.
import { JETON_MASQUE, jetonEnSuspens, octetDeJeton } from "./identifiants.ts";

// Au-delà, ce qui attend son saut de ligne est écrit sans lui.
export const ATTENTE_MAX = 1 << 20;

export type LignesMasquees = {
  recevoir(morceau: Buffer): void;
  // Écrit ce qui attendait encore : plus rien ne viendra.
  vider(): void;
};

// Où couper une attente sans saut de ligne. Jamais dans ce qui peut être un
// jeton : avant la suite d'octets de jeton qui la termine, et le reste attend.
// `dansUnJeton` : l'attente entière est une telle suite, qu'il faut bien
// couper — avant le premier début de jeton qui peut encore en devenir un, et
// lui attend ; sinon nulle part : un jeton entier prend toute la suite, et
// sans lui rien de ce qui est écrit n'en commence un.
function couper(attente: Buffer): { coupe: number; dansUnJeton: boolean } {
  const fin = attente.length;
  let suite = fin;
  while (suite > 0 && octetDeJeton(attente[suite - 1] ?? 0)) suite--;
  if (suite === 0) return { coupe: jetonEnSuspens(attente.toString("latin1")) ?? fin, dansUnJeton: true };
  if (suite < fin) return { coupe: suite, dansUnJeton: false };
  // Aucun octet de jeton à la fin : la coupe ne tombe pas pour autant au
  // milieu d'un caractère, qui s'écrirait abîmé des deux côtés.
  let dernier = fin - 1;
  while (dernier > 0 && ((attente[dernier] ?? 0) & 0xc0) === 0x80) dernier--;
  const tete = attente[dernier] ?? 0;
  const longueur = tete >= 0xf0 ? 4 : tete >= 0xe0 ? 3 : tete >= 0xc0 ? 2 : 1;
  return { coupe: fin - dernier < longueur ? dernier : fin, dansUnJeton: false };
}

// `masquer` reçoit des lignes entières, sauf au-delà de `borne` octets sans
// saut de ligne : l'attente est alors masquée et écrite telle quelle, coupée
// là où aucune forme de jeton de Claude ne peut être à cheval. Ce que `masquer`
// reconnaît d'autre — la valeur d'un secret du projet, la structure du fichier
// du compte — peut l'être, sur une ligne de cette taille.
export function lignesMasquees(masquer: (texte: string) => string, ecrire: (texte: string) => void, borne = ATTENTE_MAX): LignesMasquees {
  let attente: Buffer[] = [];
  let taille = 0;
  // Un jeton masqué jusqu'à la coupe continue après elle : sa suite ne s'écrit pas.
  let jetonEnCours = false;
  const sortir = (octets: Buffer, dansUnJeton = false) => {
    let debut = 0;
    if (jetonEnCours) {
      while (debut < octets.length && octetDeJeton(octets[debut] ?? 0)) debut++;
      if (debut === octets.length && dansUnJeton) return;
      jetonEnCours = false;
    }
    if (debut === octets.length) return;
    const texte = masquer(octets.subarray(debut).toString());
    if (dansUnJeton) jetonEnCours = texte.endsWith(JETON_MASQUE);
    ecrire(texte);
  };
  const garder = (reste: Buffer) => {
    attente = reste.length === 0 ? [] : [reste];
    taille = reste.length;
  };
  return {
    recevoir(morceau) {
      // Seul le morceau neuf est fouillé, et l'attente n'est assemblée qu'au
      // moment d'écrire : une sortie sans saut de ligne ne se relit pas en
      // entier à chaque morceau.
      const ligne = morceau.lastIndexOf(0x0a) + 1;
      if (ligne > 0) {
        sortir(Buffer.concat([...attente, morceau.subarray(0, ligne)]));
        garder(morceau.subarray(ligne));
      } else if (morceau.length > 0) {
        attente.push(morceau);
        taille += morceau.length;
      }
      if (taille < borne) return;
      const tout = Buffer.concat(attente);
      const { coupe, dansUnJeton } = couper(tout);
      sortir(tout.subarray(0, coupe), dansUnJeton);
      garder(tout.subarray(coupe));
    },
    vider() {
      sortir(Buffer.concat(attente));
      garder(Buffer.alloc(0));
    },
  };
}
