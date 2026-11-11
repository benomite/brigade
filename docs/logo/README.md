# brigade's logo: the copper queue

Two tickets waiting, the head ticket arriving at the pass, in copper. Three SVG sources, 64×64:

- `brigade-logo-clair.svg` — the logo on a light background (the README on GitHub's light theme).
- `brigade-logo-sombre.svg` — the logo on a dark background (the README on GitHub's dark theme).
- `brigade-icone.svg` — the app icon: the glyph in white on a copper rounded square. It is also the project's GitHub avatar, and the favicon of the future site (#1553): use the file as it is.

The icons of the apps are generated from these files by `app/packaging/icones.ts` and committed: `app/packaging/icones/` (Mac `.icns`, Windows `.ico`, a 1024 px PNG) and the Android mipmaps under `app/android/natif/app/src/main/res/`.

The Mac icon (`.icns`, and `Brigade-dock-1024.png` for the Dock under `npm start`) is the same drawing scaled to 824 px of body on a 1024 px canvas, the transparent margin of Apple's icon grid, so it is as big as the other icons in the Dock. `brigade-icone.svg` itself stays full-bleed (avatar, favicon, Windows, Android).

## The "Cooked by Brigade" badge (#3255)

`site/badge-cooked-by-brigade-clair.svg` and `site/badge-cooked-by-brigade-sombre.svg` are the badge for a README on a light and on a dark background: the logo mark above and the copper gradient, with the text "Cooked by Brigade". They sit in `site/` so that the site serves them at `https://benomite.github.io/brigade/badge-cooked-by-brigade-{clair,sombre}.svg`. `/brigade:init` offers the badge once (`--badge yes|no` of `app/src/plugin/init.sh`): `yes` puts a `<picture>` linked to the site as the first content of the project's README, and `.claude/brigade/badge` records the offer, so that setup never offers it again nor puts back a badge deleted by hand.
