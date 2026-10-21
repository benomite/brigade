// Ce qu'un test ne peut pas jouer sur toutes les plateformes, et pourquoi : chaque raison est dite par
// le test sauté (`{ skip: linuxOnly("requires POSIX permissions") }`), et le rapport de test l'imprime
// (« skipped on win32: requires POSIX permissions »). Là où le test se joue, la garde vaut `false`.

export type Plateforme = NodeJS.Platform;

// `false` si `courante` est l'une de `autorisees`, sinon la raison du saut, à donner à `{ skip }`.
export function seulementSur(autorisees: readonly Plateforme[], raison: string, courante: Plateforme = process.platform): string | false {
  return autorisees.includes(courante) ? false : `skipped on ${courante}: ${raison}`;
}

// Le test ne se joue que sous Linux.
export function linuxOnly(raison: string, courante: Plateforme = process.platform): string | false {
  return seulementSur(["linux"], raison, courante);
}

// Le test ne se joue que sous macOS.
export function macOnly(raison: string, courante: Plateforme = process.platform): string | false {
  return seulementSur(["darwin"], raison, courante);
}

// Le test suppose un système POSIX (Linux ou macOS) : permissions, signaux, `/bin/sh`.
export function posixOnly(raison: string, courante: Plateforme = process.platform): string | false {
  return seulementSur(["linux", "darwin"], raison, courante);
}
