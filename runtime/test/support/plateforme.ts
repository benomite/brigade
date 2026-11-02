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

// Le test ne se joue que sous Windows.
export function windowsOnly(raison: string, courante: Plateforme = process.platform): string | false {
  return seulementSur(["win32"], raison, courante);
}

// Le test suppose un système POSIX (Linux ou macOS) : permissions, signaux, `/bin/sh`.
export function posixOnly(raison: string, courante: Plateforme = process.platform): string | false {
  return seulementSur(["linux", "darwin"], raison, courante);
}

// Combien de tests d'un même `describe` jouent à la fois. Sous Windows, huit cuisines à la fois
// affament le runner : les mêmes tests y attendaient en vain, jamais les mêmes d'un run à l'autre
// (station.test.ts, reparation.test.ts ; #2071). Un seul à la fois, comme les fichiers (windows.ts).
export const CONCURRENCE = process.platform === "win32" ? 1 : 8;
