// openmotion.studio, both pages: the language and the theme; on the front page the hero's loop of the real app, the
// looks, the two cuts, the transport bar and the download; on /tour the walkthrough and its steps.
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

/* Language: English or Chinese. The page is written in English, and an element that reads differently in Chinese
   carries its Chinese beside it: data-zh for its content (HTML), data-zh-<attribute> for an attribute. The head picked
   the language before the page painted (?lang=, the visitor's choice, the browser's language); the toggle switches it
   and keeps the choice in the browser. What this script writes itself is written again by `relabel` on a switch. */
const zhAttributes = ["aria-label", "alt", "content", "title"];
const english = new Map();
for (const el of document.querySelectorAll(["[data-zh]", ...zhAttributes.map((a) => `[data-zh-${a}]`)].join(","))) {
  const attributes = zhAttributes.filter((a) => el.hasAttribute("data-zh-" + a)).map((a) => [a, el.getAttribute(a)]);
  english.set(el, { html: el.innerHTML, attributes });
}
let zh = document.documentElement.lang === "zh-CN";
const t = (en, cn) => (zh ? cn : en);
const relabel = [];
function translate() {
  document.documentElement.lang = zh ? "zh-CN" : "en";
  for (const [el, en] of english) {
    if (el.hasAttribute("data-zh")) el.innerHTML = zh ? el.dataset.zh : en.html;
    for (const [a, value] of en.attributes) el.setAttribute(a, zh ? el.getAttribute("data-zh-" + a) : value);
  }
  relabel.forEach((write) => write());
}
// The language's segmented control: the stylesheet shows the choice from the root; aria-pressed says it.
const langButtons = Array.from(document.querySelectorAll("#lang [data-lang]"));
const languageSwitched = [];
relabel.push(() => langButtons.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.lang === "zh") === zh))));
for (const button of langButtons)
  button.addEventListener("click", () => {
    if ((button.dataset.lang === "zh") === zh) return;
    zh = !zh;
    try {
      localStorage.setItem("oms-lang", zh ? "zh" : "en");
    } catch {}
    // A ?lang= in the address would undo the choice on the next visit to it.
    const url = new URL(location.href);
    if (url.searchParams.has("lang")) {
      url.searchParams.delete("lang");
      history.replaceState(null, "", url);
    }
    translate();
    languageSwitched.forEach((follow) => follow());
  });

/* Theme: light unless the visitor chose dark; the choice is kept in the browser (the page's head reads it first). */
const themeButtons = Array.from(document.querySelectorAll("#theme [data-theme-to]"));
function showTheme() {
  const dark = document.documentElement.dataset.theme === "dark";
  themeButtons.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.themeTo === "dark") === dark)));
  document.querySelector('meta[name="theme-color"]').content = dark ? "#0F0D0B" : "#FCFCFA";
}
for (const button of themeButtons)
  button.addEventListener("click", () => {
    const dark = button.dataset.themeTo === "dark";
    if (dark) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("oms-theme", dark ? "dark" : "light");
    } catch {}
    showTheme();
  });
showTheme();

/* Selects: a system draws a native select's list, so each select.select is drawn by the page instead. The select stays
   the value (code reads and sets it and listens for its change), hidden; in front of it, a button and a list of its
   options in the page's own style, as a select-only combobox (WAI-ARIA): the arrows, Home, End, Enter, Space and
   Escape work as on a native one, and a click outside closes it. Code that sets a select's value calls showSelect. */
const selectShown = new Map();
const showSelect = (select) => selectShown.get(select)?.();
document.querySelectorAll("select.select").forEach((select, n) => {
  const id = "select-list-" + n;
  const labelledBy = select.getAttribute("aria-labelledby");
  const options = Array.from(select.options);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "select";
  button.setAttribute("role", "combobox");
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", id);
  if (labelledBy) button.setAttribute("aria-labelledby", labelledBy);
  // Every option's label in one cell, only the chosen one seen, so the button is as wide as the widest.
  const value = document.createElement("span");
  value.className = "select-value";
  const labels = options.map(() => value.appendChild(document.createElement("span")));
  button.append(value);
  const list = document.createElement("ul");
  list.className = "menu";
  list.id = id;
  list.setAttribute("role", "listbox");
  if (labelledBy) list.setAttribute("aria-labelledby", labelledBy);
  list.hidden = true;
  const items = options.map((_, i) => {
    const item = document.createElement("li");
    item.id = id + "-" + i;
    item.setAttribute("role", "option");
    // The button keeps the focus while an option is clicked.
    item.addEventListener("pointerdown", (e) => e.preventDefault());
    item.addEventListener("pointermove", () => activate(i));
    item.addEventListener("click", () => choose(i));
    return item;
  });
  list.append(...items);
  const wrap = document.createElement("span");
  wrap.className = "select-wrap";
  select.after(wrap);
  wrap.append(button, list);
  select.hidden = true;

  let active = -1;
  const isOpen = () => !list.hidden;
  const show = () => {
    options.forEach((option, i) => {
      const chosen = i === select.selectedIndex;
      labels[i].textContent = items[i].textContent = option.textContent;
      labels[i].toggleAttribute("data-on", chosen);
      items[i].setAttribute("aria-selected", String(chosen));
    });
  };
  const activate = (i) => {
    active = i;
    items.forEach((item, j) => item.toggleAttribute("data-active", j === i));
    button.setAttribute("aria-activedescendant", items[i].id);
    items[i].scrollIntoView({ block: "nearest" });
  };
  const outside = (e) => {
    if (!wrap.contains(e.target)) close();
  };
  const open = () => {
    if (isOpen()) return;
    list.hidden = false;
    button.setAttribute("aria-expanded", "true");
    button.focus();
    // Below the button where it fits, else above it.
    const room = button.getBoundingClientRect();
    const tall = list.offsetHeight + 12;
    list.classList.toggle("up", innerHeight - room.bottom < tall && room.top > tall);
    activate(Math.max(select.selectedIndex, 0));
    document.addEventListener("pointerdown", outside, true);
  };
  const close = () => {
    if (!isOpen()) return;
    list.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.removeAttribute("aria-activedescendant");
    document.removeEventListener("pointerdown", outside, true);
  };
  const choose = (i) => {
    close();
    if (i !== select.selectedIndex) {
      select.selectedIndex = i;
      select.dispatchEvent(new Event("change"));
    }
    show();
  };
  button.addEventListener("click", () => (isOpen() ? close() : open()));
  button.addEventListener("blur", close);
  button.addEventListener("keydown", (e) => {
    const last = items.length - 1;
    const keys = {
      ArrowDown: () => (isOpen() ? activate(Math.min(active + 1, last)) : open()),
      ArrowUp: () => (isOpen() ? activate(Math.max(active - 1, 0)) : open()),
      Home: () => (open(), activate(0)),
      End: () => (open(), activate(last)),
      Enter: () => (isOpen() ? choose(active) : open()),
      " ": () => (isOpen() ? choose(active) : open()),
      Escape: () => (isOpen() ? close() : null),
    };
    if (!keys[e.key] || (e.key === "Escape" && !isOpen())) return;
    e.preventDefault();
    keys[e.key]();
  });
  selectShown.set(select, show);
  // The options' labels change with the page's language.
  relabel.push(show);
});

/* The top bar takes an edge once the page scrolls under it. */
const topBar = document.querySelector(".top");
const edgeTopBar = () => topBar.toggleAttribute("data-scrolled", scrollY > 4);
window.addEventListener("scroll", edgeTopBar, { passive: true });
edgeTopBar();

/* OPEN: the loop of the real app, with its four steps lit as it plays. */
const loop = document.querySelector("#loop");
// The tour was a section of this page until it had its own; links to it still say #tour.
if (loop && location.hash === "#tour") location.replace("/tour" + location.search);
if (loop) {
  const stepButtons = Array.from(document.querySelectorAll("#steps button"));
  const starts = stepButtons.map((b) => Number(b.dataset.at));
  const lightStep = () => {
    const at = loop.currentTime;
    const end = loop.duration || 18.1;
    stepButtons.forEach((button, i) => {
      const from = starts[i];
      const to = starts[i + 1] ?? end;
      const p = Math.min(Math.max((at - from) / (to - from), 0), 1);
      button.style.setProperty("--p", p * 100 + "%");
      if (at >= from && at < to) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    if (!loop.paused) requestAnimationFrame(lightStep);
  };
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
}

/* TOUR (/tour): the steps beside the film are its chapters, lit as it plays; captions follow the page's language
   unless ?captions= or the picker says otherwise. */
const tour = document.querySelector("#tour-player");
if (tour) {
  const playCover = document.querySelector("#play-tour");
  const captions = document.querySelector("#tour-language");
  const speed = document.querySelector("#tour-speed");
  const chapters = Array.from(document.querySelectorAll("#guide li"));
  const starts = chapters.map((li) => Number(li.dataset.at));
  const playTour = () => {
    tour.controls = true;
    playCover.hidden = true;
    tour.play().catch(() => {});
  };
  chapters.forEach((li, i) =>
    li.querySelector("button").addEventListener("click", () => {
      tour.currentTime = starts[i];
      playTour();
      // On a narrow screen the film is above the steps, out of sight.
      tour.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    }),
  );
  const lightChapter = () => {
    const active = starts.findLastIndex((start) => start <= tour.currentTime);
    chapters.forEach((li, i) => {
      if (i === active) li.setAttribute("aria-current", "step");
      else li.removeAttribute("aria-current");
    });
  };
  const showCaptions = () => {
    for (const track of tour.textTracks) track.mode = track.language === captions.value ? "showing" : "disabled";
    showSelect(captions);
  };
  const asked = new URLSearchParams(location.search).get("captions");
  captions.value = ["en", "zh", "off"].includes(asked) ? asked : zh ? "zh" : "en";
  showCaptions();
  captions.addEventListener("change", showCaptions);
  languageSwitched.push(() => {
    if (captions.value === "off") return;
    captions.value = zh ? "zh" : "en";
    showCaptions();
  });
  tour.textTracks.addEventListener("change", () => {
    captions.value = Array.from(tour.textTracks).find((track) => track.mode === "showing")?.language || "off";
    showSelect(captions);
  });
  speed.addEventListener("change", () => (tour.playbackRate = Number(speed.value)));
  tour.addEventListener("ratechange", () => {
    speed.value = String(tour.playbackRate);
    showSelect(speed);
  });
  tour.addEventListener("timeupdate", lightChapter);
  tour.addEventListener("play", () => {
    playCover.hidden = true;
    tour.controls = true;
  });
  playCover.addEventListener("click", playTour);
  document.querySelector("#tour-options").hidden = false;
  playCover.hidden = false;
  tour.controls = false;
  lightChapter();
}

/* LOOKS: the scroll through the pinned section picks the look; only the shown one plays. Each look's button carries its
   slug on MotionHub and its name (in the page's language). */
const taste = document.querySelector("#looks");
let through = () => null;
let showLook = () => {};
let lookCount = 0;
if (taste) {
  const looks = Array.from(taste.querySelectorAll(".look"));
  const lookButtons = Array.from(document.querySelectorAll("#look-index button"));
  lookCount = looks.length;
  const lookName = document.querySelector("#look-name");
  const slateName = document.querySelector("#slate-name");
  const lookLink = document.querySelector("#look-link");
  let look = 0;
  let looksInView = false;
  const nameLook = () => {
    const name = lookButtons[look].querySelector(".name").textContent;
    lookName.textContent = name + t(" by SuoSi", " · SuoSi 设计");
    slateName.textContent = name;
  };
  relabel.push(nameLook);
  const playLook = () => {
    looks.forEach((v, i) => {
      if (i === look && looksInView && !reduce && v.src) v.play().catch(() => {});
      else v.pause();
    });
  };
  showLook = (i) => {
    if (i === look) return;
    looks.forEach((v, j) => {
      v.classList.toggle("was", j === look);
      v.classList.toggle("on", j === i);
    });
    lookButtons.forEach((b, j) => b.setAttribute("aria-pressed", String(j === i)));
    look = i;
    nameLook();
    lookLink.href = "https://motionhub.dev/@iamsuosi/" + lookButtons[i].dataset.slug + "/";
    looks[i].preload = "auto";
    looks[i].currentTime = 0;
    // The next one starts loading, so it is ready when the scroll reaches it.
    if (looks[i + 1]) looks[i + 1].preload = "metadata";
    playLook();
  };
  new IntersectionObserver(([entry]) => {
    looksInView = entry.isIntersecting;
    playLook();
  }).observe(document.querySelector("#reel"));
  // How far the scroll has moved through the pinned section, 0 to 1; null when it is not pinned.
  through = () => {
    const span = taste.offsetHeight - innerHeight;
    if (getComputedStyle(taste.querySelector(".pin")).position !== "sticky" || span <= 0) return null;
    return Math.min(Math.max(-taste.getBoundingClientRect().top / span, 0), 1);
  };
  lookButtons.forEach((button, i) =>
    button.addEventListener("click", () => {
      if (through() === null) return showLook(i);
      const span = taste.offsetHeight - innerHeight;
      window.scrollTo({ top: taste.offsetTop + ((i + 0.5) / lookCount) * span, behavior: reduce ? "auto" : "smooth" });
    }),
  );
  if (!reduce)
    setInterval(() => {
      if (through() === null && looksInView) showLook((look + 1) % lookCount);
    }, 6000);
}

/* EDIT: slide between the same instant of the two cuts. */
const compare = document.querySelector("#compare");
if (compare) {
  const range = document.querySelector("#compare-range");
  const slide = () => {
    compare.querySelector(".compare-top").style.clipPath = "inset(0 0 0 " + range.value + "%)";
    compare.querySelector(".compare-line").style.left = range.value + "%";
  };
  range.addEventListener("input", slide);
  slide();
}

/* The transport bar follows the scroll; its scene marks jump to the scenes. */
const track = document.querySelector("#track");
if (track) {
  const scenes = Array.from(document.querySelectorAll("[data-scene]"));
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
  const placeMarks = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    scenes.forEach((scene, i) => (marks[i].style.left = Math.min(scene.offsetTop / max, 1) * 100 + "%"));
  };
  const onScroll = () => {
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
    const inLooks = through();
    if (inLooks !== null) showLook(Math.min(lookCount - 1, Math.floor(inLooks * lookCount)));
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => {
    placeMarks();
    onScroll();
  });
  window.addEventListener("load", placeMarks);
  // A switch of language reflows the page, and the scenes move.
  relabel.push(() => requestAnimationFrame(placeMarks));
  placeMarks();
  onScroll();
}

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
  const version = /\/download\/(v[\d.]+)\//.exec(chosen.href)?.[1];
  const hero = document.querySelector("#hero-get");
  hero.href = chosen.href;
  const label = () => {
    hero.textContent = t("Download for " + name, "下载 " + name + " 版");
    hero.prepend(row.querySelector(".os-icon").cloneNode(true));
    // The file's own link is already in the page's language.
    document.querySelector("#hero-build").textContent = [name, chosen.textContent.trim(), version].filter(Boolean).join(" · ");
  };
  relabel.push(label);
  label();
  document.querySelector("#hero-file").hidden = false;
}
offerDownload();

translate();
