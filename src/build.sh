#!/usr/bin/env bash
# Assemble ../index.html from the source modules.
#   head.html  — <head>, CSS, the HTML shell, right glass panel, how-to-play
#   a..g.js    — one IIFE split into numbered sections, concatenated in order
#                (they share a single scope, so order matters and none of them
#                 may be reordered or wrapped individually)
set -euo pipefail
cd "$(dirname "$0")"

cat a.js b.js c.js d.js e.js f.js g.js > .app.js
node --check .app.js

{
  cat head.html
  printf '\n<script>\n'
  cat .app.js
  printf '</script>\n</body>\n</html>\n'
} > ../index.html

rm -f .app.js
echo "wrote ../index.html ($(wc -c < ../index.html) bytes)"
