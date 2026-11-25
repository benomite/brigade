#!/bin/sh
# Rebuilds docs/demo/brigade-demo.mp4 and poster.png from renders of the app's views.
# Needs node and ffmpeg. Run from the repository root: sh docs/demo/build.sh
# Not part of the test run.
set -eu
out=docs/demo
src=$out/src
mkdir -p "$src"

i=0
for screen in premier-ticket-brouillon premier-ticket-sur-le-rail demo-cook-rail recit-premier-ticket recit-premier-ticket-servi; do
  i=$((i + 1))
  node scripts/capture-ecran/capture.ts "$screen" "$src/$i-$screen.png" --largeur 1440 --hauteur 900
done

# Each still lasts 8 s (the last 8 s), with a 1 s fade between shots: 5 x 8 - 4 x 1 = 36 s.
set -- "$src"/[1-5]-*.png
ffmpeg -y -loglevel error \
  -loop 1 -t 8 -i "$1" -loop 1 -t 8 -i "$2" -loop 1 -t 8 -i "$3" -loop 1 -t 8 -i "$4" -loop 1 -t 8 -i "$5" \
  -filter_complex "[0][1]xfade=transition=fade:duration=1:offset=7[a];[a][2]xfade=transition=fade:duration=1:offset=14[b];[b][3]xfade=transition=fade:duration=1:offset=21[c];[c][4]xfade=transition=fade:duration=1:offset=28,format=yuv420p[v]" \
  -map "[v]" -r 25 -c:v libx264 -crf 28 -an -movflags +faststart "$out/brigade-demo.mp4"

ffmpeg -y -loglevel error -ss 4 -i "$out/brigade-demo.mp4" -frames:v 1 "$out/poster.png"
