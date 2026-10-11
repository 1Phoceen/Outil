"use strict";

const KEY = "irregularVerbsConfigV4";
const OLD_KEY = "irregularVerbsConfigV3";
const $ = (id) => document.getElementById(id);

const DEFAULT_LANGUAGES = {
  en: { name: "Anglais", forms: ["Français", "Base verbale", "Prétérit", "Participe passé"] },
  de: { name: "Allemand", forms: ["Français", "Infinitif", "3e pers. présent (er/sie/es)", "Prétérit", "Participe II"] }
};

const EXAMPLES = {
  en: "aller,go,went,gone\nvoir,see,saw,seen\nfaire,do,did,done\nprendre,take,took,taken\nécrire,write,wrote,written\nvenir,come,came,come\nacheter,buy,bought,bought\nsavoir,know,knew,known\napprendre,learn,learnt/learned,learnt/learned\ncouper,cut,cut,cut",
  de: "aller,gehen,geht,ging,gegangen\nvoir,sehen,sieht,sah,gesehen\nmanger,essen,isst,aß,gegessen\nboire,trinken,trinkt,trank,getrunken\ndonner,geben,gibt,gab,gegeben\nprendre,nehmen,nimmt,nahm,genommen\nlire,lesen,liest,las,gelesen\ndormir,schlafen,schläft,schlief,geschlafen\nvenir,kommen,kommt,kam,gekommen\nécrire,schreiben,schreibt,schrieb,geschrieben"
};

function defaultState() {
  return {
    current: "en",
    languages: JSON.parse(JSON.stringify(DEFAULT_LANGUAGES)),
    data: { en: { raw: "", selected: null }, de: { raw: "", selected: null } },
    given: {},
    settings: { ignoreAccents: false, translit: true, delay: 700, autoNext: true, count: 0, shuffle: true }
  };
}

let state = loadState();
let verbs = [];
let selected = new Set();
let session = null;
let timer = 0;

/* ---------- Stockage ---------- */
function loadState() {
  const base = defaultState();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.languages && Object.keys(s.languages).length) {
        return {
          current: s.languages[s.current] ? s.current : Object.keys(s.languages)[0],
          languages: s.languages,
          data: s.data || {},
          given: s.given || {},
          settings: Object.assign(base.settings, s.settings)
        };
      }
    }
    const old = localStorage.getItem(OLD_KEY); // migration V3
    if (old) {
      const o = JSON.parse(old);
      const en = o.byLanguage && o.byLanguage.en;
      if (en) base.data.en = { raw: en.raw || "", selected: en.selectedLineIds || null };
    }
  } catch { /* stockage indisponible ou corrompu */ }
  return base;
}

function saveState() {
  const d = langData();
  d.raw = $("verbs-input").value;
  d.selected = Array.from(selected);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

const lang = () => state.languages[state.current];
const langData = () => (state.data[state.current] = state.data[state.current] || { raw: "", selected: null });

function getGiven() {
  const n = lang().forms.length;
  const g = (state.given[state.current] || []).filter((i) => i < n);
  return g.length ? g : lang().forms.map((_, i) => i);
}

/* ---------- Utilitaires ---------- */
function setFeedback(el, msg, type = "") {
  el.textContent = msg;
  el.classList.remove("error", "success");
  if (type) el.classList.add(type);
}

function norm(value) {
  const s = state.settings;
  let v = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (s.translit) v = v.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  if (s.ignoreAccents) v = v.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return v;
}

const alternatives = (cell) => cell.split("/").map(norm).filter(Boolean);

function isCorrect(expectedCell, provided) {
  const alts = alternatives(expectedCell);
  const parts = provided.split("/").map(norm).filter(Boolean);
  if (!parts.length) return false;
  if (parts.length === 1) return alts.includes(parts[0]);
  return alts.length === parts.length && parts.every((p) => alts.includes(p)); // toutes les variantes données
}

function parseVerbs(raw, cols) {
  const out = [];
  raw.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).forEach((line, index) => {
    const cells = line.split(/[;\t,]/).map((c) => c.trim());
    if (cells.length !== cols || cells.some((c) => !c)) {
      throw new Error(`Ligne ${index + 1} invalide (${cols} colonnes attendues) : "${line}"`);
    }
    out.push({ id: index, cells });
  });
  return out;
}

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* ---------- Config : rendu ---------- */
function renderLanguageSelect() {
  const sel = $("language-select");
  sel.innerHTML = "";
  Object.entries(state.languages).forEach(([id, l]) => {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = l.name;
    sel.appendChild(o);
  });
  sel.value = state.current;
}

function renderLanguageUI() {
  const l = lang();
  $("format-hint").textContent = l.forms.join(",");
  $("lang-name").value = l.name;
  $("lang-forms").value = l.forms.join(", ");
  $("verbs-input").placeholder = (EXAMPLES[state.current] || l.forms.map((f) => "…").join(",")).split("\n").slice(0, 2).join("\n");
  $("prompt-prefix").textContent = "Complète les autres formes à partir de :";

  const box = $("given-box");
  box.innerHTML = "";
  const given = new Set(getGiven());
  l.forms.forEach((f, i) => {
    const lab = document.createElement("label");
    lab.className = "check";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = given.has(i);
    cb.addEventListener("change", () => {
      const now = Array.from(box.querySelectorAll("input")).map((c, k) => (c.checked ? k : -1)).filter((k) => k >= 0);
      if (!now.length) { cb.checked = true; return; }
      state.given[state.current] = now;
      saveState();
    });
    lab.append(cb, document.createTextNode(" " + f));
    box.appendChild(lab);
  });
}

function renderSettings() {
  const s = state.settings;
  $("opt-count").value = s.count;
  $("opt-delay").value = s.delay;
  $("opt-shuffle").checked = s.shuffle;
  $("opt-autonext").checked = s.autoNext;
  $("opt-accents").checked = s.ignoreAccents;
  $("opt-translit").checked = s.translit;
}

function renderSelection() {
  const box = $("verbs-selection");
  box.innerHTML = "";
  if (!verbs.length) {
    box.textContent = "Aucun verbe pour le moment.";
    return;
  }
  const frag = document.createDocumentFragment();
  verbs.forEach((v) => {
    const row = document.createElement("label");
    row.className = "selection-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selected.has(v.id);
    cb.addEventListener("change", () => {
      cb.checked ? selected.add(v.id) : selected.delete(v.id);
      saveState();
    });
    const t = document.createElement("span");
    t.textContent = `${v.cells[0]} → ${v.cells.slice(1).join(" / ")}`;
    row.append(cb, t);
    frag.appendChild(row);
  });
  box.appendChild(frag);
}

function loadList(message) {
  const d = langData();
  $("verbs-input").value = d.raw || "";
  selected = new Set(Array.isArray(d.selected) ? d.selected : []);
  refreshList(message, false);
}

function refreshList(message, persist = true) {
  const raw = $("verbs-input").value;
  if (!raw.trim()) {
    verbs = [];
    selected = new Set();
    renderSelection();
    if (persist) saveState();
    setFeedback($("config-feedback"), message || "");
    return true;
  }
  try {
    verbs = parseVerbs(raw, lang().forms.length);
    const ids = new Set(verbs.map((v) => v.id));
    selected = new Set(Array.from(selected).filter((id) => ids.has(id)));
    if (!selected.size) selected = ids;
    renderSelection();
    if (persist) saveState();
    setFeedback($("config-feedback"), message || `${verbs.length} verbes enregistrés.`, "success");
    return true;
  } catch (e) {
    verbs = [];
    renderSelection();
    setFeedback($("config-feedback"), e.message, "error");
    return false;
  }
}

function showView(name) {
  ["config", "quiz", "result"].forEach((v) => $("view-" + v).classList.toggle("hidden", v !== name));
}

/* ---------- Quiz ---------- */
function startSession(list) {
  clearTimeout(timer);
  const s = state.settings;
  const total = s.count > 0 ? s.count : list.length;
  const queue = [];
  while (queue.length < total) {
    const pass = s.shuffle ? shuffle(list.slice()) : list.slice();
    queue.push(...pass.slice(0, total - queue.length));
  }
  session = { queue, pos: 0, score: 0, errors: [], phase: "answering", given: 0, list };
  showView("quiz");
  showQuestion();
}

function showQuestion() {
  const l = lang();
  const verb = session.queue[session.pos];
  const givenIdx = getGiven();
  session.given = givenIdx[Math.floor(Math.random() * givenIdx.length)];
  session.phase = "answering";

  $("given-word").textContent = `${l.forms[session.given]} : ${verb.cells[session.given]}`;
  $("progress").textContent = `${session.pos + 1}/${session.queue.length}`;
  $("score").textContent = session.score;
  $("submit-btn").textContent = "Vérifier";
  setFeedback($("quiz-feedback"), "");

  const box = $("quiz-inputs");
  box.innerHTML = "";
  l.forms.forEach((f, i) => {
    if (i === session.given) return;
    const label = document.createElement("label");
    label.className = "label";
    label.htmlFor = "in-" + i;
    label.textContent = f;
    const input = document.createElement("input");
    input.id = "in-" + i;
    input.type = "text";
    input.autocomplete = "off";
    input.autocapitalize = "off";
    input.spellcheck = false;
    input.dataset.idx = i;
    box.append(label, input);
  });
  const first = box.querySelector("input");
  if (first) first.focus();
}

function checkAnswer() {
  const verb = session.queue[session.pos];
  let allGood = true;
  document.querySelectorAll("#quiz-inputs input").forEach((input) => {
    const ok = isCorrect(verb.cells[Number(input.dataset.idx)], input.value);
    input.classList.toggle("ok", ok);
    input.classList.toggle("ko", !ok);
    if (!ok) allGood = false;
  });

  if (allGood) {
    session.score++;
    $("score").textContent = session.score;
    setFeedback($("quiz-feedback"), "Correct !", "success");
    if (state.settings.autoNext) {
      session.phase = "wait";
      timer = setTimeout(nextQuestion, state.settings.delay);
      return;
    }
  } else {
    if (!session.errors.includes(verb)) session.errors.push(verb);
    setFeedback($("quiz-feedback"), "Correction : " + verb.cells.join(" / "), "error");
  }
  session.phase = "review";
  $("submit-btn").textContent = "Suivant";
  $("submit-btn").focus();
}

function nextQuestion() {
  if (!session) return;
  session.pos++;
  if (session.pos >= session.queue.length) return showResult();
  showQuestion();
}

function showResult() {
  $("final-score").textContent = `${session.score} / ${session.queue.length}`;
  const list = $("errors-list");
  list.innerHTML = "";
  session.errors.forEach((v) => {
    const li = document.createElement("li");
    li.textContent = v.cells.join(" / ");
    list.appendChild(li);
  });
  $("errors-block").classList.toggle("hidden", !session.errors.length);
  $("retry-errors-btn").classList.toggle("hidden", !session.errors.length);
  showView("result");
}

function leaveToConfig() {
  clearTimeout(timer);
  session = null;
  showView("config");
}

/* ---------- Événements ---------- */
$("language-select").addEventListener("change", (e) => {
  saveState();
  state.current = e.target.value;
  renderLanguageUI();
  loadList(langData().raw ? undefined : `Aucune liste pour ${lang().name}.`);
  saveState();
});

$("lang-save").addEventListener("click", () => {
  const forms = $("lang-forms").value.split(",").map((f) => f.trim()).filter(Boolean);
  const name = $("lang-name").value.trim();
  if (!name || forms.length < 2) return setFeedback($("config-feedback"), "Donne un nom et au moins 2 colonnes.", "error");
  lang().name = name;
  lang().forms = forms;
  delete state.given[state.current];
  renderLanguageSelect();
  renderLanguageUI();
  refreshList("Langue enregistrée.");
});

$("lang-new").addEventListener("click", () => {
  const forms = $("lang-forms").value.split(",").map((f) => f.trim()).filter(Boolean);
  const name = $("lang-name").value.trim();
  if (!name || forms.length < 2) return setFeedback($("config-feedback"), "Donne un nom et au moins 2 colonnes.", "error");
  saveState();
  const id = "l" + Date.now();
  state.languages[id] = { name, forms };
  state.data[id] = { raw: "", selected: null };
  state.current = id;
  renderLanguageSelect();
  renderLanguageUI();
  loadList(`Langue « ${name} » créée.`);
  saveState();
});

$("lang-delete").addEventListener("click", () => {
  if (Object.keys(state.languages).length < 2) return setFeedback($("config-feedback"), "Impossible de supprimer la dernière langue.", "error");
  if (!confirm(`Supprimer « ${lang().name} » et sa liste ?`)) return;
  delete state.languages[state.current];
  delete state.data[state.current];
  state.current = Object.keys(state.languages)[0];
  renderLanguageSelect();
  renderLanguageUI();
  loadList();
  saveState();
});

$("example-btn").addEventListener("click", () => {
  const ex = EXAMPLES[state.current];
  if (!ex) return setFeedback($("config-feedback"), "Pas d'exemple pour cette langue.", "error");
  if ($("verbs-input").value.trim() && !confirm("Remplacer la liste actuelle par l'exemple ?")) return;
  $("verbs-input").value = ex;
  selected = new Set();
  refreshList();
});

$("save-btn").addEventListener("click", () => refreshList());
$("sel-all").addEventListener("click", () => { selected = new Set(verbs.map((v) => v.id)); renderSelection(); saveState(); });
$("sel-none").addEventListener("click", () => { selected = new Set(); renderSelection(); saveState(); });

const bindSetting = (id, key, read) => $(id).addEventListener("change", (e) => {
  state.settings[key] = read(e.target);
  saveState();
});
bindSetting("opt-count", "count", (el) => Math.max(0, parseInt(el.value, 10) || 0));
bindSetting("opt-delay", "delay", (el) => Math.max(0, parseInt(el.value, 10) || 0));
bindSetting("opt-shuffle", "shuffle", (el) => el.checked);
bindSetting("opt-autonext", "autoNext", (el) => el.checked);
bindSetting("opt-accents", "ignoreAccents", (el) => el.checked);
bindSetting("opt-translit", "translit", (el) => el.checked);

$("start-btn").addEventListener("click", () => {
  if (!refreshList()) return;
  const list = verbs.filter((v) => selected.has(v.id));
  if (!list.length) return setFeedback($("config-feedback"), "Coche au moins un verbe pour démarrer.", "error");
  startSession(list);
});

$("quiz-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!session) return;
  if (session.phase === "answering") checkAnswer();
  else if (session.phase === "review") nextQuestion();
});

$("back-btn").addEventListener("click", leaveToConfig);
$("result-back-btn").addEventListener("click", leaveToConfig);
$("restart-btn").addEventListener("click", () => startSession(session.list));
$("retry-errors-btn").addEventListener("click", () => startSession(session.errors.slice()));

$("export-btn").addEventListener("click", () => {
  saveState();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
  a.download = "verbes-irreguliers.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

$("import-btn").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const s = JSON.parse(reader.result);
      if (!s.languages || !Object.keys(s.languages).length) throw new Error();
      localStorage.setItem(KEY, JSON.stringify(s));
      state = loadState();
      init("Sauvegarde importée.");
    } catch {
      setFeedback($("config-feedback"), "Fichier d'import invalide.", "error");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

/* ---------- Init ---------- */
function init(message) {
  renderLanguageSelect();
  renderLanguageUI();
  renderSettings();
  loadList(message);
  showView("config");
}

init();
