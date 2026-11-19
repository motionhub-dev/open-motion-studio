"""Drive the real X pointer on $DISPLAY through XTest, one command a line on stdin:
  move X Y MS     glide to (X, Y) in MS milliseconds, eased like a hand
  down / up       press or release the left button
  click           press and release
Each command answers "ok" when it is done."""
import ctypes
import math
import os
import sys
import time

x11 = ctypes.cdll.LoadLibrary("libX11.so.6")
xtst = ctypes.cdll.LoadLibrary("libXtst.so.6")
x11.XOpenDisplay.restype = ctypes.c_void_p
display = ctypes.c_void_p(x11.XOpenDisplay(os.environ["DISPLAY"].encode()))
if not display.value:
    sys.exit("no display")

here = [960.0, 540.0]


def put(x, y):
    xtst.XTestFakeMotionEvent(display, -1, int(x), int(y), 0)
    x11.XFlush(display)
    here[0], here[1] = x, y


def glide(x, y, ms):
    x0, y0 = here
    steps = max(1, int(ms / 16))
    for i in range(1, steps + 1):
        e = 0.5 - math.cos(math.pi * i / steps) / 2
        put(x0 + (x - x0) * e, y0 + (y - y0) * e)
        time.sleep(ms / 1000 / steps)


def button(down):
    xtst.XTestFakeButtonEvent(display, 1, 1 if down else 0, 0)
    x11.XFlush(display)


put(*here)
for line in sys.stdin:
    word = line.split()
    if not word:
        continue
    if word[0] == "move":
        glide(float(word[1]), float(word[2]), float(word[3]))
    elif word[0] == "down":
        button(True)
    elif word[0] == "up":
        button(False)
    elif word[0] == "click":
        button(True)
        time.sleep(0.07)
        button(False)
    print("ok", flush=True)
