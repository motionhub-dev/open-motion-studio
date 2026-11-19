#!/usr/bin/env bash
# Record the website's hero film: the built Studio (pnpm build) on an Xvfb display at 1920x1080, recorded by ffmpeg at
# 30 fps, driven by runner.cjs with the real pointer (pointer.py) and a real coding agent (Claude Code).
# Usage: shoot.sh OUT_DIR [dry]   (dry stops before the message is sent, so no agent turn is spent)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
out=$(realpath -m "$1")
mkdir -p "$out"
export OMS_DESKTOP=$(cd "$here/../.." && pwd)
export SHOOT_TEMP=$(mktemp -d "$out/run-XXXX")
mkdir -p "$SHOOT_TEMP/user-data" "$SHOOT_TEMP/projects"
cat > "$SHOOT_TEMP/user-data/settings.json" <<EOF
{"providers":[],"active":null,"workspace":"$SHOOT_TEMP/projects","preferences":{"language":"en","theme":"dark","onboardingComplete":true,"backgroundNoticeSeen":true,"checkUpdatesAutomatically":false}}
EOF
[ "${2:-}" = dry ] && export DRY=1

unset ELECTRON_RUN_AS_NODE  # set inside editors' terminals; Electron would run as plain Node
export DISPLAY=:99
Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp >/dev/null 2>&1 &
xvfb=$!
sleep 1.5
ffmpeg -v error -y -f x11grab -draw_mouse 1 -framerate 30 -video_size 1920x1080 -i :99 \
  -c:v libx264 -preset veryfast -crf 16 -pix_fmt yuv420p "$SHOOT_TEMP/raw.mp4" &
rec=$!
date +%s%3N > "$SHOOT_TEMP/rec-start"
electron=$(cd "$OMS_DESKTOP" && node -e 'console.log(require("electron"))')
"$electron" --no-sandbox "$here/runner.cjs" > "$SHOOT_TEMP/electron.log" 2>&1 || true
kill -INT $rec; wait $rec || true
kill $xvfb || true
echo "$SHOOT_TEMP"
