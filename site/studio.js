// studio.motionhub.dev: the hero's loop of the real app, the tour, the looks, the two cuts and the transport bar.
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const pad = (n) => String(n).padStart(2, "0");
// SMPTE timecode at 24 fps: hh:mm:ss:ff.
const smpte = (seconds) => {
  const f = Math.floor(seconds * 24);
  const s = Math.floor(f / 24);
  return pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60) + ":" + pad(f % 24);
};
// Play a muted video while it is on screen, pause it when it is not.
function playInView(video, wanted = () => true) {
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && wanted()) video.play().catch(() => {});
    else video.pause();
  }).observe(video);
}

/* OPEN: the loop of the real app, with its five steps lit as it plays. */
const loop = document.querySelector("#loop");
const stepButtons = Array.from(document.querySelectorAll("#steps button"));
const starts = stepButtons.map((b) => Number(b.dataset.at));
function lightStep() {
  const t = loop.currentTime;
  const end = loop.duration || 18.1;
  stepButtons.forEach((button, i) => {
    const from = starts[i];
    const to = starts[i + 1] ?? end;
    const p = Math.min(Math.max((t - from) / (to - from), 0), 1);
    button.style.setProperty("--p", p * 100 + "%");
    if (t >= from && t < to) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
  if (!loop.paused) requestAnimationFrame(lightStep);
}
loop.addEventListener("play", () => requestAnimationFrame(lightStep));
loop.addEventListener("seeked", lightStep);
stepButtons.forEach((button, i) =>
  button.addEventListener("click", () => {
    loop.currentTime = starts[i];
    loop.play().catch(() => {});
  }),
);
if (reduce) loop.controls = true;
else playInView(loop);

/* TOUR: chapters, captions in English or Chinese, and speed. */
const tour = document.querySelector("#tour-player");
const playCover = document.querySelector("#play-tour");
const language = document.querySelector("#tour-language");
const speed = document.querySelector("#tour-speed");
const chapterNav = document.querySelector("#chapters");
const chapters = [
  [0, "Open the project", "打开项目"],
  [7.208, "Import the photograph", "导入照片"],
  [17.208, "Brief Codex", "交代创作要求"],
  [39.208, "Mark the title", "圈选标题，提出修改"],
  [59.458, "Compare the cuts", "对比修改前后"],
  [72.958, "Export the MP4", "导出成片"],
];
function playTour() {
  tour.controls = true;
  playCover.hidden = true;
  loop.pause();
  tour.play().catch(() => {});
}
for (const [start, title] of chapters) {
  const button = document.createElement("button");
  button.type = "button";
  const time = document.createElement("span");
  time.textContent = Math.floor(start / 60) + ":" + pad(Math.floor(start % 60));
  const label = document.createElement("span");
  label.textContent = title;
  button.append(time, label);
  button.addEventListener("click", () => {
    tour.currentTime = start;
    playTour();
  });
  chapterNav.append(button);
}
function lightChapter() {
  const active = chapters.findLastIndex(([start]) => start <= tour.currentTime);
  Array.from(chapterNav.children).forEach((b, i) => {
    if (i === active) b.setAttribute("aria-current", "step");
    else b.removeAttribute("aria-current");
  });
}
function translateTour() {
  const zh = language.value === "zh";
  playCover.querySelector("span").textContent = zh ? "播放完整演示" : "Play the tour";
  document.querySelector("#captions-label").textContent = zh ? "字幕" : "Captions";
  document.querySelector("#speed-label").textContent = zh ? "倍速" : "Speed";
  chapterNav.setAttribute("aria-label", zh ? "演示章节" : "Tour chapters");
  Array.from(chapterNav.children).forEach((b, i) => {
    b.lastElementChild.textContent = chapters[i][zh ? 2 : 1];
  });
}
function setCaptions() {
  for (const track of tour.textTracks) track.mode = track.language === language.value ? "showing" : "disabled";
  translateTour();
}
const asked = new URLSearchParams(location.search).get("captions");
language.value = ["en", "zh", "off"].includes(asked) ? asked : navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
setCaptions();
language.addEventListener("change", setCaptions);
tour.textTracks.addEventListener("change", () => {
  language.value = Array.from(tour.textTracks).find((t) => t.mode === "showing")?.language || "off";
  translateTour();
});
speed.addEventListener("change", () => (tour.playbackRate = Number(speed.value)));
tour.addEventListener("ratechange", () => (speed.value = String(tour.playbackRate)));
tour.addEventListener("timeupdate", lightChapter);
tour.addEventListener("play", () => {
  playCover.hidden = true;
  tour.controls = true;
  loop.pause();
});
playCover.addEventListener("click", playTour);
document.querySelector(".watch").addEventListener("click", playTour);
chapterNav.hidden = false;
document.querySelector("#tour-options").hidden = false;
playCover.hidden = false;
tour.controls = false;
lightChapter();

/* LOOKS: the scroll through the pinned section picks the look; only the shown one plays. */
const taste = document.querySelector("#looks");
const looks = Array.from(taste.querySelectorAll(".look"));
const lookButtons = Array.from(document.querySelectorAll("#look-index button"));
const lookName = document.querySelector("#look-name");
const lookLink = document.querySelector("#look-link");
const lookMeta = [
  ["Riso Pop by SuoSi", "riso-pop"],
  ["Stage Light by SuoSi", "stage-light"],
  ["Night Diagram by SuoSi", "night-diagram"],
];
let look = 0;
let looksInView = false;
function playLook() {
  looks.forEach((v, i) => {
    if (i === look && looksInView && !reduce) v.play().catch(() => {});
    else v.pause();
  });
}
function showLook(i) {
  if (i === look) return;
  looks.forEach((v, j) => {
    v.classList.toggle("was", j === look);
    v.classList.toggle("on", j === i);
  });
  lookButtons.forEach((b, j) => b.setAttribute("aria-pressed", String(j === i)));
  lookName.textContent = lookMeta[i][0];
  lookLink.href = "https://motionhub.dev/@iamsuosi/" + lookMeta[i][1] + "/";
  look = i;
  looks[i].preload = "auto";
  looks[i].currentTime = 0;
  playLook();
}
new IntersectionObserver(([entry]) => {
  looksInView = entry.isIntersecting;
  playLook();
}).observe(document.querySelector("#reel"));
// How far the scroll has moved through the pinned section, 0 to 1; null when it is not pinned.
function through(section) {
  const span = section.offsetHeight - innerHeight;
  if (getComputedStyle(section.querySelector(".pin")).position !== "sticky" || span <= 0) return null;
  return Math.min(Math.max(-section.getBoundingClientRect().top / span, 0), 1);
}
lookButtons.forEach((button, i) =>
  button.addEventListener("click", () => {
    if (through(taste) === null) return showLook(i);
    const span = taste.offsetHeight - innerHeight;
    window.scrollTo({ top: taste.offsetTop + ((i + 0.5) / 3) * span, behavior: reduce ? "auto" : "smooth" });
  }),
);
if (!reduce)
  setInterval(() => {
    if (through(taste) === null && looksInView) showLook((look + 1) % 3);
  }, 4000);

/* EDIT: slide between the same instant of the two cuts. */
const range = document.querySelector("#compare-range");
const compare = document.querySelector("#compare");
function slide() {
  compare.querySelector(".compare-top").style.clipPath = "inset(0 0 0 " + range.value + "%)";
  compare.querySelector(".compare-line").style.left = range.value + "%";
}
range.addEventListener("input", slide);
slide();

/* The transport bar follows the scroll; its scene marks jump to the scenes. */
const scenes = Array.from(document.querySelectorAll("[data-scene]"));
const track = document.querySelector("#track");
const fill = document.querySelector("#fill");
const head = document.querySelector("#head");
const tc = document.querySelector("#tc");
const now = document.querySelector("#now");
const marks = scenes.map((scene) => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = scene.dataset.scene;
  button.addEventListener("click", () => scene.scrollIntoView({ behavior: reduce ? "auto" : "smooth" }));
  track.append(button);
  return button;
});
function placeMarks() {
  const max = document.documentElement.scrollHeight - innerHeight;
  scenes.forEach((scene, i) => (marks[i].style.left = Math.min(scene.offsetTop / max, 1) * 100 + "%"));
}
function onScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  const p = max > 0 ? scrollY / max : 0;
  fill.style.width = p * 100 + "%";
  head.style.left = p * 100 + "%";
  tc.textContent = smpte(p * 90);
  let current = 0;
  scenes.forEach((scene, i) => {
    if (scrollY + innerHeight * 0.4 >= scene.offsetTop) current = i;
  });
  marks.forEach((m, i) => m.setAttribute("aria-current", String(i === current)));
  now.textContent = scenes[current].dataset.scene;
  const t = through(taste);
  if (t !== null) showLook(Math.min(2, Math.floor(t * 3)));
}
window.addEventListener("scroll", onScroll, { passive: true });
window.addEventListener("resize", () => {
  placeMarks();
  onScroll();
});
window.addEventListener("load", placeMarks);
placeMarks();
onScroll();

/* Theme: light unless the visitor chose dark; the choice is kept in the browser (the page's head reads it first). */
const themeButton = document.querySelector("#theme");
function showTheme() {
  const dark = document.documentElement.dataset.theme === "dark";
  themeButton.setAttribute("aria-label", dark ? "Switch to the light theme" : "Switch to the dark theme");
  themeButton.title = dark ? "Light theme" : "Dark theme";
  document.querySelector('meta[name="theme-color"]').content = dark ? "#0F0D0B" : "#FCFCFA";
}
themeButton.addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  if (dark) document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  try {
    localStorage.setItem("oms-theme", dark ? "dark" : "light");
  } catch {}
  showTheme();
});
showTheme();

/* Download: the hero's button gives the installer for the visitor's system straight away, with a line naming it
   and the way to the others; the matching row below is lit. The files are the download rows' own links. */
const platform = navigator.userAgentData?.platform || navigator.platform || "";
const mobile =
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
const os = mobile ? "" : /mac/i.test(platform) ? "mac" : /win/i.test(platform) ? "win" : /linux/i.test(platform) ? "linux" : "";
const row = os && document.querySelector('#os [data-os="' + os + '"]');
async function offerDownload() {
  if (!row) return;
  row.classList.add("sug");
  const files = Array.from(row.querySelectorAll("a"));
  // The first link is Apple silicon on a Mac and x64 on Linux; the second, where there is one, is the other chip.
  // Only Chromium tells the chip; elsewhere the first is offered and the line under the button says which it is.
  let chosen = files[0];
  try {
    const { architecture } = await navigator.userAgentData.getHighEntropyValues(["architecture"]);
    if (os === "mac" && architecture === "x86" && files[1]) chosen = files[1];
    if (os === "linux" && architecture === "arm" && files[1]) chosen = files[1];
  } catch {}
  const name = row.querySelector("b").textContent;
  const hero = document.querySelector("#hero-get");
  hero.textContent = "Download for " + name;
  hero.href = chosen.href;
  const version = /\/download\/(v[\d.]+)\//.exec(chosen.href)?.[1];
  document.querySelector("#hero-build").textContent = [name, chosen.textContent.trim(), version].filter(Boolean).join(" · ");
  document.querySelector("#hero-file").hidden = false;
}
offerDownload();
