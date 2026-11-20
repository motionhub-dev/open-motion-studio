"""Cut the website's hero loop (site/media/studio-loop.mp4) from a take of shoot.sh.
Usage: cut.py RUN_DIR [OUT.mp4]

Each shot is rendered to its own short file from a seek into raw.mp4, then the shots are joined by cuts or a
crossfade. Times come from the take's marks.json, so a new take cuts the same way."""
import json
import os
import subprocess
import sys

run = sys.argv[1]
out = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else os.path.join(run, "studio-loop.mp4"))
os.chdir(run)
start = int(open("rec-start").read())
m = {x["name"]: (x["at"] - start) / 1000 for x in json.load(open("marks.json"))}

STAGE = "crop=1184:666:390:52"       # the film and its controls
LEFT_BOTTOM = "crop=1280:720:0:360"  # the composer and the timeline
AGENT = "crop=864:486:0:36,scale=1440:810:flags=lanczos"  # the assistant close, while it works
SPOT = "drawbox=x=716:y=0:w=724:h=810:color=black@0.72:t=fill"  # the film beside it dimmed (it rebuilds meanwhile)
# From the assistant beside the film (1280 wide at 0,0) to the film alone (1100 wide at 432,75): hold 0.9 s, push in
# over 0.9 s with an ease. It ends a little inside the film (INSET), so no edge of the app around it shows. The take is
# doubled first so the moving crop is steady.
E = "(st(0,clip((in/30-0.9)/0.9,0,1))*0+ld(0)*ld(0)*(3-2*ld(0)))"
FILM_X, FILM_Y, FILM_W, INSET = 432, 75, 1100, 1.025
end_w = FILM_W / INSET
end_x, end_y = FILM_X + (FILM_W - end_w) / 2, FILM_Y + (FILM_W - end_w) * 9 / 32
PUSH = (f"scale=3840:2160:flags=lanczos,zoompan=z='1.5+{1920 / end_w - 1.5:.4f}*{E}'"
        f":x='{2 * end_x:.1f}*{E}':y='{2 * end_y:.1f}*{E}':d=1:s=1440x810:fps=30")
WORK = 3.6  # the agent's turn, however long, sped up to this many seconds
HOLD = 1.2  # the last frame held

work = (m["sent"] + 1.6, m["agent-done"] - 0.2)
# (start, end, speed, filter or None, crossfade into it in seconds, 0 for a cut)
shots = [
    (m["play-v1"] + 0.3, m["play-v1"] + 2.3, 1.0, None, 0),                  # the first cut plays
    (m["drag"] - 0.3, m["drag"] + 2.6, 1.0, STAGE, 0),                       # the bars are marked
    (m["note"] - 0.15, m["note"] + 5.55, 1.5, STAGE, 0),                     # the note
    (m["note"] + 5.55, m["sent"] + 1.6, 2.0, LEFT_BOTTOM, 0),                # sent to the agent
    (*work, (work[1] - work[0]) / WORK, f"{AGENT},{SPOT}", 0),               # the agent at work, its steps filling in
    (m["play-v2"] + 1.06, m["play-v2"] + 3.45, 1.0, PUSH, 0.6),              # its reply, the bars rising, push in; out before the second scene
]

lengths = []
for i, (a, b, sp, vf, _) in enumerate(shots):
    seek = max(0.0, a - 1)
    # Cut the take's seconds first (trim), then speed them up: a duration given to ffmpeg would bound the output.
    chain = [f"trim=start={a - seek:.3f}:end={b - seek:.3f}", f"setpts=(PTS-STARTPTS)/{sp}"] + ([vf] if vf else [])
    # zoompan already gives 30 fps; fps after it reads its timestamps as a gap and fills it with copies.
    chain += ["scale=1440:810:flags=lanczos", "setsar=1"] + ([] if vf == PUSH else ["fps=30"]) + ["format=yuv420p"]
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{seek:.3f}", "-t", f"{b - seek + 0.2:.3f}", "-i", "raw.mp4", "-vf", ",".join(chain), "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "14",
                    f"shot{i}.mp4"], check=True)
    lengths.append((b - a) / sp + (HOLD if i == len(shots) - 1 else 0))

# The last frame is held here, at the join: held right after zoompan, ffmpeg repeats it far too long.
graph = [f"[{i}:v]settb=1/30,setpts=PTS-STARTPTS" + (f",tpad=stop_mode=clone:stop_duration={HOLD}" if i == len(shots) - 1 else "")
         + f"[v{i}]" for i in range(len(shots))]
acc, total, starts = "v0", lengths[0], [0.0]
for i in range(1, len(shots)):
    fade = shots[i][4]
    begin = total - fade
    if fade:
        graph.append(f"[{acc}][v{i}]xfade=transition=fade:duration={fade}:offset={begin:.3f}[j{i}]")
    else:
        graph.append(f"[{acc}][v{i}]concat=n=2:v=1:a=0,settb=1/30[j{i}]")
    starts.append(begin)
    total, acc = begin + lengths[i], f"j{i}"
graph.append(f"[{acc}]format=yuv420p[out]")
inputs = sum((["-i", f"shot{i}.mp4"] for i in range(len(shots))), [])
subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(graph), "-map", "[out]", "-c:v", "libx264",
                "-preset", "slow", "-crf", "24", "-profile:v", "high", "-movflags", "+faststart", "-an", out], check=True)
print("shots start at", ", ".join(f"{s:.2f}" for s in starts), f"· total {total:.2f}s")
print(f"steps: 01 at 0 · 02 at {starts[2]:.1f} · 03 at {starts[4]:.1f} · 04 at {starts[5]:.1f}")
