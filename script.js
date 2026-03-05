"use strict";

const STORAGE_KEY = "irregularVerbsConfigV2";
const SUCCESS_DELAY_MS = 700;
const CHEF_LIST_NAME = "La liste du Chef";
const CHEF_LIST_RAW = "apprendre,erfahren,erfährt,erfuhr,hat erfahren\ninventer,erfinden,erfindet,erfand,hat erfunden\nmanger,essen,isst,aß,hat gegessen\naller,fahren,fährt,fuhr,ist gefahren\ntomber,Fallen,fällt,fiel,ist gefallen";

const LANGUAGE_CONFIG = {
  de: {
    name: "allemand",
    expectedCols: 5,
    formatHint: "francais,infinitif,present,preterit,parfait",
    placeholder: "aller,gehen,geht,ging,ist gegangen\nvoir,sehen,sieht,sah,hat gesehen",
    promptPrefix: "Complete les autres formes allemandes a partir de :",
    randomGivenKeys: ["fr", "base", "present", "preterit", "perfect"],
    forms: [
      { key: "fr", label: "Francais" },
      { key: "base", label: "Infinitif" },
      { key: "present", label: "Present" },
      { key: "preterit", label: "Preterit" },
      { key: "perfect", label: "Parfait" }
    ]
  }
};

const viewConfig = document.getElementById("view-config");
const viewQuiz = document.getElementById("view-quiz");
const languageSelect = document.getElementById("language-select");
const formatHint = document.getElementById("format-hint");
const verbsInput = document.getElementById("verbs-input");
const verbsSelection = document.getElementById("verbs-selection");
const saveBtn = document.getElementById("save-btn");
const startBtn = document.getElementById("start-btn");
const backBtn = document.getElementById("back-btn");
const configFeedback = document.getElementById("config-feedback");

const promptPrefix = document.getElementById("prompt-prefix");
const frenchWord = document.getElementById("french-word");
const scoreEl = document.getElementById("score");
const seenCountEl = document.getElementById("seen-count");
const quizForm = document.getElementById("quiz-form");
const quizInputs = document.getElementById("quiz-inputs");
const quizFeedback = document.getElementById("quiz-feedback");
const chefModal = document.getElementById("chef-modal");
const chefModalConfirmBtn = document.getElementById("chef-modal-confirm");
const chefModalCancelBtn = document.getElementById("chef-modal-cancel");

let currentLanguage = "de";
let verbs = [];
let selectedLineIds = new Set();
let quizVerbs = [];
let currentVerb = null;
let score = 0;
let seenCount = 0;
let remainingIndexes = [];
let currentGivenKey = "fr";
let storageState = createDefaultStorageState();
let lastFocusedElement = null;

function createDefaultStorageState() {
  return {
    currentLanguage: "de",
    byLanguage: {
      de: { raw: "", selectedLineIds: [] }
    }
  };
}

function ensureLanguageData(language) {
  if (!storageState.byLanguage[language]) {
    storageState.byLanguage[language] = { raw: "", selectedLineIds: [] };
  }
  return storageState.byLanguage[language];
}

function normalize(value) {
  return value.trim().toLowerCase();
}

function setFeedback(element, message, type = "") {
  element.textContent = message;
  element.classList.remove("error", "success");
  if (type) {
    element.classList.add(type);
  }
}

function getLanguageConfig() {
  return LANGUAGE_CONFIG[currentLanguage];
}

function applyLanguageUI() {
  const config = getLanguageConfig();
  formatHint.textContent = config.formatHint;
  verbsInput.placeholder = config.placeholder;
  promptPrefix.textContent = config.promptPrefix;
  renderQuizInputs();
}

function applyChefList() {
  openChefModal();
}

function openChefModal() {
  if (!chefModal || !chefModalConfirmBtn) {
    return;
  }
  lastFocusedElement = document.activeElement;
  chefModal.classList.remove("hidden");
  chefModalConfirmBtn.focus();
}

function closeChefModal() {
  if (!chefModal) {
    return;
  }
  chefModal.classList.add("hidden");
  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
  }
}

function confirmChefListAdd() {
  closeChefModal();

  const existing = verbsInput.value.trim();
  verbsInput.value = existing ? `${existing}\n${CHEF_LIST_RAW}` : CHEF_LIST_RAW;

  if (saveList()) {
    setFeedback(configFeedback, `${CHEF_LIST_NAME} ajoutee.`, "success");
  }
}

function parseVerbLines(raw, language) {
  const config = LANGUAGE_CONFIG[language];

  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split(",").map((part) => part.trim());
      if (parts.length !== config.expectedCols || parts.some((part) => !part)) {
        throw new Error(`Ligne ${index + 1} invalide pour ${config.name} : "${line}"`);
      }

      const verb = {
        lineId: index,
        fr: parts[0],
        base: parts[1],
        present: parts[2],
        preterit: parts[3]
      };

      if (language === "de") {
        verb.perfect = parts[4];
      }

      return verb;
    });
}

function getVerbDisplay(verb) {
  const values = [verb.base, verb.present, verb.preterit];
  if (currentLanguage === "de") {
    values.push(verb.perfect);
  }
  return `${verb.fr} -> ${values.join(" / ")}`;
}

function renderSelectionList() {
  verbsSelection.innerHTML = "";

  if (verbs.length === 0) {
    verbsSelection.textContent = "Aucun verbe parse pour le moment.";
    return;
  }

  const fragment = document.createDocumentFragment();

  verbs.forEach((verb) => {
    const row = document.createElement("label");
    row.className = "selection-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedLineIds.has(verb.lineId);
    checkbox.dataset.lineId = String(verb.lineId);
    checkbox.addEventListener("change", () => {
      const lineId = Number(checkbox.dataset.lineId);
      if (checkbox.checked) {
        selectedLineIds.add(lineId);
      } else {
        selectedLineIds.delete(lineId);
      }
      persistCurrentState();
    });

    const text = document.createElement("span");
    text.textContent = getVerbDisplay(verb);

    row.appendChild(checkbox);
    row.appendChild(text);
    fragment.appendChild(row);
  });

  verbsSelection.appendChild(fragment);
}

function renderQuizInputs() {
  const formsToAsk = getCurrentAskedForms();
  quizInputs.innerHTML = "";

  const fragment = document.createDocumentFragment();

  formsToAsk.forEach((form, index) => {
    const inputId = `input-${form.key}`;

    const label = document.createElement("label");
    label.className = "label";
    label.htmlFor = inputId;
    label.textContent = form.label;

    const input = document.createElement("input");
    input.id = inputId;
    input.type = "text";
    input.autocomplete = "off";
    input.required = true;
    input.dataset.formKey = form.key;

    if (index === 0) {
      input.dataset.first = "true";
    }

    fragment.appendChild(label);
    fragment.appendChild(input);
  });

  quizInputs.appendChild(fragment);
}

function getCurrentAskedForms() {
  const config = getLanguageConfig();
  const givenKey = currentGivenKey || "fr";
  return config.forms.filter((form) => form.key !== givenKey);
}

function pickRandomGivenKey() {
  const config = getLanguageConfig();
  const keys = config.randomGivenKeys;
  return keys[Math.floor(Math.random() * keys.length)];
}

function updatePromptWord() {
  if (!currentVerb) {
    frenchWord.textContent = "-";
    return;
  }

  const config = getLanguageConfig();
  const givenForm = config.forms.find((form) => form.key === currentGivenKey);
  const label = givenForm ? givenForm.label : "Forme";
  frenchWord.textContent = `${label} : ${currentVerb[currentGivenKey]}`;
}

function getQuizInputs() {
  return Array.from(quizInputs.querySelectorAll("input[data-form-key]"));
}

function resetQuizInputs() {
  const inputs = getQuizInputs();
  inputs.forEach((input) => {
    input.value = "";
  });
  if (inputs.length > 0) {
    inputs[0].focus();
  }
}

function updateScoreDisplay() {
  scoreEl.textContent = String(score);
  seenCountEl.textContent = String(seenCount);
}

function showQuizView() {
  viewConfig.classList.add("hidden");
  viewQuiz.classList.remove("hidden");
}

function showConfigView() {
  viewQuiz.classList.add("hidden");
  viewConfig.classList.remove("hidden");
}

function pickRandomVerb() {
  if (remainingIndexes.length === 0) {
    remainingIndexes = quizVerbs.map((_, index) => index);
  }

  const randomPosition = Math.floor(Math.random() * remainingIndexes.length);
  const verbIndex = remainingIndexes.splice(randomPosition, 1)[0];
  currentVerb = quizVerbs[verbIndex];
  currentGivenKey = pickRandomGivenKey();
  renderQuizInputs();
  updatePromptWord();
}

function persistCurrentState() {
  const languageData = ensureLanguageData(currentLanguage);
  languageData.raw = verbsInput.value;
  languageData.selectedLineIds = Array.from(selectedLineIds);
  storageState.currentLanguage = currentLanguage;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(storageState));
}

function saveList() {
  const raw = verbsInput.value;

  try {
    const parsed = parseVerbLines(raw, currentLanguage);
    verbs = parsed;

    const parsedIds = new Set(parsed.map((verb) => verb.lineId));

    if (selectedLineIds.size === 0) {
      selectedLineIds = parsedIds;
    } else {
      selectedLineIds = new Set(Array.from(selectedLineIds).filter((id) => parsedIds.has(id)));
      if (selectedLineIds.size === 0) {
        selectedLineIds = parsedIds;
      }
    }

    persistCurrentState();
    renderSelectionList();
    setFeedback(configFeedback, `${verbs.length} verbes enregistres.`, "success");
    return true;
  } catch (error) {
    verbs = [];
    renderSelectionList();
    setFeedback(configFeedback, error.message, "error");
    return false;
  }
}

function loadListFromStorage() {
  const savedRaw = localStorage.getItem(STORAGE_KEY);
  if (!savedRaw) {
    applyLanguageUI();
    renderSelectionList();
    return;
  }

  try {
    const saved = JSON.parse(savedRaw);
    storageState = createDefaultStorageState();

    if (saved && typeof saved === "object" && saved.byLanguage) {
      storageState.currentLanguage = LANGUAGE_CONFIG[saved.currentLanguage] ? saved.currentLanguage : "de";
      Object.keys(LANGUAGE_CONFIG).forEach((language) => {
        const incoming = saved.byLanguage[language];
        if (incoming && typeof incoming === "object") {
          storageState.byLanguage[language] = {
            raw: typeof incoming.raw === "string" ? incoming.raw : "",
            selectedLineIds: Array.isArray(incoming.selectedLineIds) ? incoming.selectedLineIds : []
          };
        }
      });
    } else {
      // Compatibilite avec l'ancien format (une seule langue stockee).
      const legacyLanguage = LANGUAGE_CONFIG[saved.language] ? saved.language : "de";
      storageState.currentLanguage = legacyLanguage;
      storageState.byLanguage[legacyLanguage] = {
        raw: typeof saved.raw === "string" ? saved.raw : "",
        selectedLineIds: Array.isArray(saved.selectedLineIds) ? saved.selectedLineIds : []
      };
    }

    currentLanguage = storageState.currentLanguage;
    languageSelect.value = currentLanguage;

    const languageData = ensureLanguageData(currentLanguage);
    verbsInput.value = languageData.raw;
    selectedLineIds = new Set(languageData.selectedLineIds);

    applyLanguageUI();

    if (verbsInput.value.trim()) {
      const parsed = parseVerbLines(verbsInput.value, currentLanguage);
      verbs = parsed;

      const parsedIds = new Set(parsed.map((verb) => verb.lineId));
      selectedLineIds = new Set(Array.from(selectedLineIds).filter((id) => parsedIds.has(id)));
      if (selectedLineIds.size === 0) {
        selectedLineIds = parsedIds;
      }

      renderSelectionList();
      setFeedback(configFeedback, `${verbs.length} verbes charges depuis le stockage.`, "success");
    } else {
      verbs = [];
      renderSelectionList();
    }
  } catch {
    verbs = [];
    selectedLineIds = new Set();
    applyLanguageUI();
    renderSelectionList();
    setFeedback(configFeedback, "La configuration sauvegardee est invalide.", "error");
  }
}

function startQuiz() {
  if (!saveList()) {
    return;
  }

  quizVerbs = verbs.filter((verb) => selectedLineIds.has(verb.lineId));

  if (quizVerbs.length === 0) {
    setFeedback(configFeedback, "Coche au moins un verbe pour demarrer le quiz.", "error");
    return;
  }

  score = 0;
  seenCount = 0;
  remainingIndexes = [];
  updateScoreDisplay();
  setFeedback(quizFeedback, "");
  pickRandomVerb();
  resetQuizInputs();
  showQuizView();
}

function checkCurrentAnswer() {
  if (!currentVerb) {
    return;
  }

  const inputs = getQuizInputs();
  let allGood = true;

  inputs.forEach((input) => {
    const key = input.dataset.formKey;
    const expected = normalize(currentVerb[key] || "");
    const provided = normalize(input.value);
    if (provided !== expected) {
      allGood = false;
    }
  });

  seenCount += 1;

  if (allGood) {
    score += 1;
    updateScoreDisplay();
    setFeedback(quizFeedback, "Correct. Verbe suivant...", "success");
    setTimeout(() => {
      pickRandomVerb();
      resetQuizInputs();
      setFeedback(quizFeedback, "");
    }, SUCCESS_DELAY_MS);
    return;
  }

  updateScoreDisplay();

  const correctionKeys = getLanguageConfig().forms.map((form) => form.key);
  const correction = correctionKeys.map((key) => currentVerb[key]).join(" / ");
  setFeedback(quizFeedback, `Correction : ${correction}`, "error");
}

languageSelect.addEventListener("change", () => {
  persistCurrentState();
  currentLanguage = languageSelect.value;
  applyLanguageUI();
  const languageData = ensureLanguageData(currentLanguage);
  verbsInput.value = languageData.raw;
  selectedLineIds = new Set(languageData.selectedLineIds);

  if (verbsInput.value.trim()) {
    try {
      verbs = parseVerbLines(verbsInput.value, currentLanguage);
      const parsedIds = new Set(verbs.map((verb) => verb.lineId));
      selectedLineIds = new Set(Array.from(selectedLineIds).filter((id) => parsedIds.has(id)));
      if (selectedLineIds.size === 0) {
        selectedLineIds = parsedIds;
      }
      renderSelectionList();
      setFeedback(configFeedback, `${verbs.length} verbes charges pour ${getLanguageConfig().name}.`, "success");
    } catch {
      verbs = [];
      renderSelectionList();
      setFeedback(configFeedback, "Liste invalide pour cette langue. Corrige puis enregistre.", "error");
    }
  } else {
    verbs = [];
    renderSelectionList();
    setFeedback(configFeedback, `Aucune liste enregistree pour ${getLanguageConfig().name}.`);
  }
  persistCurrentState();
});

saveBtn.addEventListener("click", saveList);
startBtn.addEventListener("click", startQuiz);
backBtn.addEventListener("click", showConfigView);

quizForm.addEventListener("submit", (event) => {
  event.preventDefault();
  checkCurrentAnswer();
});

loadListFromStorage();

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && chefModal && !chefModal.classList.contains("hidden")) {
    closeChefModal();
    return;
  }

  if (event.key.toLowerCase() !== "c") {
    return;
  }

  if (viewConfig.classList.contains("hidden")) {
    return;
  }

  const activeTag = document.activeElement ? document.activeElement.tagName : "";
  if (activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT" || activeTag === "BUTTON") {
    return;
  }

  applyChefList();
});

if (chefModalConfirmBtn) {
  chefModalConfirmBtn.addEventListener("click", confirmChefListAdd);
}

if (chefModalCancelBtn) {
  chefModalCancelBtn.addEventListener("click", closeChefModal);
}

if (chefModal) {
  chefModal.addEventListener("click", (event) => {
    if (event.target === chefModal) {
      closeChefModal();
    }
  });
                                         }
