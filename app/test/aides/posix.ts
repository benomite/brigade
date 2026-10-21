// Les doublures que l'app lance à la place de ses vrais programmes — un faux `ssh`, un faux
// `claude`, un faux `gh` — sont des scripts POSIX : un `#!/bin/sh` rendu exécutable, ou un `.ts`
// lancé par son shebang. Windows ne lance aucun script par son chemin — il lui faut un vrai `.exe` —,
// et n'a pas de `/bin/sh`. Les tests qui en lancent y sont donc sautés, en le disant, comme ceux du
// vrai pty là où node-pty n'est pas livré compilé.
export const SANS_POSIX: string | false =
  process.platform === "win32" ? "Windows runs no script by its path, and has no /bin/sh: this test's stand-ins are POSIX scripts" : false;
