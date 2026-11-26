// Les lignes que l'app écrit dans la configuration de la station
// (`station/configuration.ts`), par la station : un bloc à part, entre deux
// commentaires, que la station réécrit seule. Ce qui est hors du bloc — les
// lignes que le chef a écrites à la main — n'est jamais touché.
export const DEBUT = "# — projets ajoutés depuis l'app : la station réécrit ce bloc seule, ne l'édite pas —";
export const FIN = "# — fin des projets ajoutés depuis l'app —";

// Le texte, coupé autour du bloc. Sans bloc, il est tout entier « avant ».
function couper(texte: string): { avant: string[]; dedans: string[]; apres: string[] } {
  const lignes = texte.split("\n");
  const debut = lignes.indexOf(DEBUT);
  const fin = debut === -1 ? -1 : lignes.indexOf(FIN, debut + 1);
  if (debut === -1) return { avant: lignes, dedans: [], apres: [] };
  // Un bloc sans fin court jusqu'au bout du fichier.
  const bout = fin === -1 ? lignes.length : fin;
  return { avant: lignes.slice(0, debut), dedans: lignes.slice(debut + 1, bout), apres: fin === -1 ? [] : lignes.slice(fin + 1) };
}

const utiles = (lignes: string[]) => lignes.map((ligne) => ligne.trim()).filter((ligne) => ligne !== "" && !ligne.startsWith("#"));

// Chaque ligne une fois, la première gardée : un projet écrit plusieurs fois
// est le même projet. Les blancs d'une ligne ne la distinguent pas d'une autre.
// Les lignes que `exempte` reconnaît (par leur clé) sont gardées telles quelles.
const dedoubler = (lignes: string[], exempte: (cle: string) => boolean): string[] => {
  const vues = new Set<string>();
  return lignes.filter((ligne) => {
    const cle = ligne.trim().split(/\s+/).join(" ");
    if (exempte(cle)) return true;
    if (vues.has(cle)) return false;
    vues.add(cle);
    return true;
  });
};

// Tout est dédoublé sauf les lignes vides : dans le bloc, `# held-back …` se répète.
const sansDoublons = (lignes: string[]): string[] => dedoubler(lignes, (cle) => cle === "");

// Les commentaires du chef, hors du bloc, restent tels quels : seules les lignes de projet sont dédoublées.
const projetsSansDoublons = (lignes: string[]): string[] => dedoubler(lignes, (cle) => cle === "" || cle.startsWith("#"));

// Les lignes du bloc, chacune une fois.
export const lignesDuBloc = (texte: string): string[] => sansDoublons(utiles(couper(texte).dedans));

// Les lignes de commentaire du bloc : celles du chef.
// La réécriture les garde, telles quelles, chacune une fois : une ligne mise de
// côté (`# held-back …`) ne s'y répète pas.
export const commentairesDuBloc = (texte: string): string[] => sansDoublons(couper(texte).dedans.filter((ligne) => ligne.trim().startsWith("#")));

// Les noms de projet que le chef a écrits hors du bloc.
export const nomsHorsDuBloc = (texte: string): string[] => {
  const { avant, apres } = couper(texte);
  return utiles([...avant, ...apres]).map((ligne) => ligne.split(/\s+/)[0] ?? "");
};

// Le texte, son bloc réécrit avec ces lignes, à sa place. Sans ligne, le bloc
// disparaît, sauf s'il porte des commentaires (ils restent, avant les lignes) ;
// sans bloc, il s'ajoute à la fin.
export function reecrireBloc(texte: string, lignes: string[]): string {
  const commentaires = commentairesDuBloc(texte);
  const uniques = sansDoublons(lignes);
  const bloc = uniques.length === 0 && commentaires.length === 0 ? [] : [DEBUT, ...commentaires, ...uniques, FIN];
  if (texte.split("\n").includes(DEBUT)) {
    const { avant, apres } = couper(texte);
    // Le blanc qui le séparait des lignes à la main part avec lui.
    if (bloc.length === 0 && avant.at(-1) === "") avant.pop();
    const rendu = projetsSansDoublons([...avant, ...bloc, ...apres]).join("\n");
    return rendu.endsWith("\n") || rendu === "" ? rendu : `${rendu}\n`;
  }
  if (bloc.length === 0) return texte;
  const garde = texte.replace(/\n*$/, "");
  return `${garde}${garde === "" ? "" : "\n\n"}${bloc.join("\n")}\n`;
}
