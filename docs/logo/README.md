# brigade's logo: the copper queue

Two tickets waiting, the head ticket arriving at the pass, in copper. Three SVG sources, 64×64:

- `brigade-logo-clair.svg` — the logo on a light background (the README on GitHub's light theme).
- `brigade-logo-sombre.svg` — the logo on a dark background (the README on GitHub's dark theme).
- `brigade-icone.svg` — the app icon: the glyph in white on a copper rounded square. It is also the project's GitHub avatar, and the favicon of the future site (#1553): use the file as it is.

The icons of the apps are generated from these files by `app/packaging/icones.ts` and committed: `app/packaging/icones/` (Mac `.icns`, Windows `.ico`, a 1024 px PNG) and the Android mipmaps under `app/android/natif/app/src/main/res/`.
