import {
  ReflexCore,
  createDefaultFormulaAST,
  FINGER_DECIMAL_PLACES,
} from './core-engine.mjs';
import {
  defaultImageExportPresets,
  canvasToPngBlob,
  downloadBlob,
  promptImageExportSize,
} from './image-export.mjs';
import { formulaAstToLatex, renderLatexToCanvas } from './formula-renderer.mjs';
import { visitAst } from './ast-utils.mjs';
import { parseFormulaInput } from './arithmetic-parser.mjs';
import { formatCaretIndicator } from './parse-error-format.mjs';
import {
  FORMULA_PARAM,
  FORMULA_B64_PARAM,
  LAST_STATE_SEARCH_KEY,
  verifyCompressionSupport,
  readFormulaFromQuery,
  writeFormulaToSearchParams,
  updateFormulaQueryParam,
  updateFormulaQueryParamImmediately,
  replaceUrlSearch,
} from './formula-url.mjs';
import { pruneFingerUrlParams } from './finger-url-prune.mjs';
import { setupMenuDropdown } from './menu-ui.mjs';
import { lerp } from './anim-utils.mjs';

const canvas = document.getElementById('glcanvas');
const formulaTextarea = document.getElementById('formula');
const errorDiv = document.getElementById('error');
const fingerIndicatorStack = document.getElementById('finger-indicator-stack');
const fingerOverlay = document.getElementById('finger-overlay');
const menuButton = document.getElementById('menu-button');
const menuDropdown = document.getElementById('menu-dropdown');
const undoButton = document.getElementById('undo-button');
const redoButton = document.getElementById('redo-button');
const versionPill = document.getElementById('app-version-pill');
const rootElement = typeof document !== 'undefined' ? document.documentElement : null;

let fatalErrorActive = false;

const APP_VERSION = 25;
const CONTEXT_LOSS_RELOAD_KEY = `reflex4you:contextLossReloaded:v${APP_VERSION}`;
const RESUME_RELOAD_KEY = `reflex4you:resumeReloaded:v${APP_VERSION}`;
const LAST_HIDDEN_AT_KEY = `reflex4you:lastHiddenAtMs:v${APP_VERSION}`;
// Empirically, some mobile PWAs end up in a broken/blank state after being backgrounded
// long enough for the OS to suspend/kill GPU resources. Reloading on resume is the most
// reliable recovery. The user reports the issue begins around 20s.
const RESUME_RELOAD_THRESHOLD_MS = 20000;

if (versionPill) {
  versionPill.textContent = `v${APP_VERSION}`;
  versionPill.setAttribute('data-version', String(APP_VERSION));
}

// Expose a JS build marker to help debug HTML/JS cache mismatches (PR previews).
if (typeof window !== 'undefined') {
  window.__reflexJsBuildId = `js-v${APP_VERSION}`;
}

const EDIT_PARAM = 'edit';
const ANIMATION_TIME_PARAM = 't';
const SOLOS_PARAM = 'solos';

const DEFAULT_ANIMATION_SECONDS = 5;

const ALL_W_FINGER_LABELS = ['W0', 'W1', 'W2'];
const W_PAIR_ZERO = ['W0', 'W1'];
const W_PAIR_LEGACY = ['W1', 'W2'];
const FINGER_LABEL_REGEX = /^(?:[FD]\d+|W[012])$/;

function isFingerLabel(label) {
  return typeof label === 'string' && FINGER_LABEL_REGEX.test(label);
}

function fingerFamily(label) {
  if (!label) return null;
  if (label.startsWith('F')) return 'fixed';
  if (label.startsWith('D')) return 'dynamic';
  if (label.startsWith('W')) return 'w';
  return null;
}

function fingerIndex(label) {
  if (!label) return -1;
  if (label === 'W0') return 0;
  if (label === 'W1') return 1;
  if (label === 'W2') return 2;
  const match = /^([FD])(\d+)$/.exec(label);
  if (!match) return -1;
  const raw = Number(match[2]);
  if (!Number.isInteger(raw) || raw < 0) return -1;
  return raw === 0 ? 0 : raw - 1;
}

function defaultFingerOffset(label) {
  if (label === 'W1') {
    return { x: 1, y: 0 };
  }
  return { x: 0, y: 0 };
}

function getFingerMeta(label) {
  return {
    label,
    type: fingerFamily(label) || 'fixed',
  };
}

function sortFingerLabels(labels) {
  return labels
    .slice()
    .filter((label) => isFingerLabel(label))
    .sort((a, b) => {
      const fa = fingerFamily(a);
      const fb = fingerFamily(b);
      if (fa !== fb) {
        // Keep fixed/dynamic ahead of workspace.
        if (fa === 'w') return 1;
        if (fb === 'w') return -1;
      }
      return fingerIndex(a) - fingerIndex(b);
    });
}

const fingerDots = new Map();
const fingerLastSerialized = {};
const latestOffsets = {};
const knownFingerLabels = new Set();
const fingerUnsubscribers = new Map();

let fingerSoloButton = null;
let fingerSoloDropdown = null;
let fingerSoloList = null;
let fingerSoloHint = null;
let fingerSoloValueRefreshers = [];
let fingerSoloFooter = null;
let fingerSoloAnimStartButton = null;
let fingerSoloAnimEndButton = null;
let fingerSoloAnimDurationButton = null;
let fingerSoloAnimGlobalToggleButton = null;

// When solos are non-empty, only those labels can capture pointers.
// Solos are stored in the URL as `solos=F1,D2,...` (comma separated).
let soloLabelSet = new Set();

// Used to display live values while dragging and keep them visible after release.
let currentGestureTouchedLabels = new Set();
let pinnedDisplayLabels = [];

// Auto-solo newly introduced constants only after the initial page load.
// Otherwise a reload would treat all constants as "new" and incorrectly expand solos.
let hasAppliedFingerStateOnce = false;

function ensureFingerState(label) {
  if (!isFingerLabel(label)) {
    return;
  }
  knownFingerLabels.add(label);
  if (!latestOffsets[label]) {
    latestOffsets[label] = defaultFingerOffset(label);
  }
  if (!(label in fingerLastSerialized)) {
    fingerLastSerialized[label] = null;
  }
}

// Always keep workspace fingers in a known state.
ALL_W_FINGER_LABELS.forEach((label) => ensureFingerState(label));

function ensureFingerSubscriptions(labels) {
  if (!reflexCore) {
    return;
  }
  (labels || []).forEach((label) => {
    if (!isFingerLabel(label)) {
      return;
    }
    ensureFingerState(label);
    if (fingerUnsubscribers.has(label)) {
      return;
    }
    const unsubscribe = reflexCore.onFingerChange(label, (offset) => handleFingerValueChange(label, offset));
    fingerUnsubscribers.set(label, unsubscribe);
  });
}

function applyFingerValuesFromQuery(labels) {
  if (!reflexCore) {
    return;
  }
  suppressFingerQueryUpdates = true;
  const params = new URLSearchParams(window.location.search);
  let normalizedQuery = false;
  try {
    (labels || []).forEach((label) => {
      if (!isFingerLabel(label)) {
        return;
      }
      // W0 and W2 are aliases (W0 is the "zero" end). Accept either in share links.
      let raw = params.get(label);
      if ((label === 'W0' || label === 'W2') && (raw == null || raw === '')) {
        const peer = label === 'W0' ? 'W2' : 'W0';
        raw = params.get(peer);
      }
      const parsed = parseComplexString(raw);
      if (parsed) {
        reflexCore.setFingerValue(label, parsed.x, parsed.y, { triggerRender: false });
        // Normalize URL values to the same quantized representation used internally,
        // so reloads remain deterministic and GPU uniforms match the URL display.
        const stored = reflexCore.getFingerValue(label);
        const normalized = formatComplexForQuery(stored.x, stored.y);
        if (normalized && normalized !== raw) {
          params.set(label, normalized);
          fingerLastSerialized[label] = normalized;
          normalizedQuery = true;
        }
      }
    });
  } finally {
    suppressFingerQueryUpdates = false;
  }
  if (normalizedQuery) {
    replaceUrlSearch(params);
  }
  reflexCore.render();
}

function getParserOptionsFromFingers() {
  return { fingerValues: latestOffsets };
}

let activeFingerState = createEmptyFingerState();

let suppressFingerQueryUpdates = false;

const ANIMATION_SUFFIX = 'A';

let viewerModeActive = false;
let viewerModeRevealed = false;

let animationSeconds = DEFAULT_ANIMATION_SECONDS;
let animationController = null;
let animationDraftStart = null;
let sessionEditMode = false;

// Per-parameter animation preview (plays even in edit mode).
let previewLabelSet = new Set();
let previewController = null;

// Global animation track state (derived from URL intervals).
let globalAllTrackLabelSet = new Set();
let globalEffectiveTrackLabelSet = new Set();
// Labels temporarily excluded from global playback (so they become draggable).
let globalMutedLabelSet = new Set();

function createEmptyFingerState() {
  return {
    mode: 'none',
    fixedSlots: [],
    dynamicSlots: [],
    wSlots: [],
    axisConstraints: new Map(),
    allSlots: [],
    activeLabelSet: new Set(),
  };
}

function parseSolosParam(raw) {
  if (!raw) return new Set();
  const normalized = String(raw).trim();
  if (!normalized) return new Set();
  const parts = normalized
    .split(',')
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  const set = new Set();
  for (const label of parts) {
    if (isFingerLabel(label)) {
      set.add(label);
    }
  }
  return set;
}

function serializeSolosParam(labels) {
  const list = sortFingerLabels(Array.from(labels || []).filter((l) => isFingerLabel(l)));
  return list.length ? list.join(',') : null;
}

function updateSolosQueryParam(nextSet) {
  const params = new URLSearchParams(window.location.search);
  const serialized = serializeSolosParam(nextSet);
  if (!serialized) {
    params.delete(SOLOS_PARAM);
  } else {
    params.set(SOLOS_PARAM, serialized);
  }
  replaceUrlSearch(params);
}

function ensureFingerSoloUI() {
  if (!fingerIndicatorStack) {
    return;
  }
  if (fingerSoloButton && fingerSoloDropdown && fingerSoloList && fingerSoloFooter) {
    return;
  }

  fingerIndicatorStack.innerHTML = '';

  const anchor = document.createElement('div');
  anchor.id = 'finger-solo-anchor';

  const button = document.createElement('button');
  button.id = 'finger-solo-button';
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'finger-solo-dropdown');
  button.title = 'Select which parameters your fingers can move';

  const dropdown = document.createElement('div');
  dropdown.id = 'finger-solo-dropdown';
  dropdown.setAttribute('role', 'dialog');
  dropdown.setAttribute('aria-label', 'Parameter selection');
  dropdown.dataset.open = 'false';

  const header = document.createElement('div');
  header.className = 'finger-solo-dropdown__title';
  header.textContent = 'Parameters';

  const hint = document.createElement('div');
  hint.className = 'finger-solo-dropdown__hint';
  hint.textContent = 'Fingers can move all parameters. Tap a value to edit. Check any to enable solo mode.';

  const list = document.createElement('div');
  list.className = 'finger-solo-list';

  const footer = document.createElement('div');
  footer.className = 'finger-solo-footer';

  const animRow = document.createElement('div');
  animRow.className = 'finger-solo-footer__row';

  const globalToggle = document.createElement('button');
  globalToggle.type = 'button';
  globalToggle.className = 'finger-solo-footer__button';
  globalToggle.textContent = '▶ Anim';
  globalToggle.title = 'Play/pause all animations (for parameters with animation intervals)';

  const animStart = document.createElement('button');
  animStart.type = 'button';
  animStart.className = 'finger-solo-footer__button';
  animStart.textContent = 'Set anim start';
  animStart.title = 'Capture current values as animation start (for all active handles)';

  const animEnd = document.createElement('button');
  animEnd.type = 'button';
  animEnd.className = 'finger-solo-footer__button';
  animEnd.textContent = 'Set anim end';
  animEnd.title = 'Write animation intervals using the current values as end (for all handles captured in “start”)';

  const animTime = document.createElement('button');
  animTime.type = 'button';
  animTime.className = 'finger-solo-footer__button';
  animTime.textContent = 'Anim duration…';
  animTime.title = 'Set animation duration (seconds)';

  globalToggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleGlobalAnimationPlayback();
  });

  animStart.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setAnimationStartFromCurrent();
  });

  animEnd.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    commitHistorySnapshot();
    setAnimationEndFromCurrent();
    scheduleCommitHistorySnapshot();
  });

  animTime.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    commitHistorySnapshot();
    promptAndSetAnimationTime();
    scheduleCommitHistorySnapshot();
  });

  animRow.appendChild(globalToggle);
  animRow.appendChild(animStart);
  animRow.appendChild(animEnd);
  animRow.appendChild(animTime);
  footer.appendChild(animRow);

  dropdown.appendChild(header);
  dropdown.appendChild(hint);
  dropdown.appendChild(list);
  dropdown.appendChild(footer);

  anchor.appendChild(button);
  anchor.appendChild(dropdown);
  fingerIndicatorStack.appendChild(anchor);

  function setOpen(isOpen) {
    dropdown.dataset.open = isOpen ? 'true' : 'false';
    button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) {
      // Values may have changed since the list was last built.
      rebuildFingerSoloList();
    }
  }

  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const open = dropdown.dataset.open === 'true';
    setOpen(!open);
  });

  document.addEventListener('pointerdown', (event) => {
    if (!dropdown.contains(event.target) && !button.contains(event.target)) {
      setOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
    }
  });

  fingerSoloButton = button;
  fingerSoloDropdown = dropdown;
  fingerSoloList = list;
  fingerSoloHint = hint;
  fingerSoloFooter = footer;
  fingerSoloAnimGlobalToggleButton = globalToggle;
  fingerSoloAnimStartButton = animStart;
  fingerSoloAnimEndButton = animEnd;
  fingerSoloAnimDurationButton = animTime;
}

function getSoloModeEnabled() {
  const activeCount = activeFingerState?.activeLabelSet?.size ?? 0;
  return soloLabelSet.size > 0 && activeCount > 1;
}

function isFingerSoloDropdownOpen() {
  return fingerSoloDropdown?.dataset?.open === 'true';
}

function refreshFingerSoloValueDisplays() {
  if (!isFingerSoloDropdownOpen()) {
    return;
  }
  for (const refresh of fingerSoloValueRefreshers) {
    try {
      refresh();
    } catch (_) {
      // ignore
    }
  }

  // Keep footer controls in sync too.
  try {
    const { all } = buildEffectiveGlobalTracksFromQuery();
    const animatedCount = all.size;
    if (fingerSoloAnimGlobalToggleButton) {
      // Show only when multiple parameters are animatable.
      fingerSoloAnimGlobalToggleButton.style.display = animatedCount >= 2 ? '' : 'none';
      const playing = Boolean(animationController?.isPlaying?.());
      fingerSoloAnimGlobalToggleButton.textContent = playing ? '⏸ Anim' : '▶ Anim';
      fingerSoloAnimGlobalToggleButton.setAttribute('aria-pressed', playing ? 'true' : 'false');
    }
  } catch (_) {
    // ignore
  }
}

function formatFingerValueForEditor(label) {
  const latest = reflexCore?.getFingerValue?.(label) ?? latestOffsets?.[label] ?? defaultFingerOffset(label);
  return formatComplexForQuery(latest.x, latest.y) || '0+0i';
}

function applyFingerValueFromEditor(label, raw) {
  const parsed = parseComplexString(raw);
  if (!parsed) {
    return { ok: false, message: 'Use "a+bi" or "real,imag".' };
  }
  if (!reflexCore) {
    return { ok: false, message: 'Renderer unavailable.' };
  }
  reflexCore.setFingerValue(label, parsed.x, parsed.y);
  return { ok: true };
}

function buildInlineFingerValueEditor(label) {
  const wrap = document.createElement('div');
  wrap.className = 'finger-solo-row__value-wrap';

  const display = document.createElement('button');
  display.type = 'button';
  display.className = 'finger-solo-row__value';
  display.setAttribute('aria-label', `Edit ${label} value`);
  display.title = 'Click to edit';

  const editor = document.createElement('div');
  editor.className = 'finger-solo-row__value-editor';

  function createValueInput({ ariaLabel, className }) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = className;
    input.spellcheck = false;
    input.autocapitalize = 'off';
    input.autocomplete = 'off';
    input.inputMode = 'text';
    input.setAttribute('aria-label', ariaLabel);
    return input;
  }

  const currentInput = createValueInput({
    ariaLabel: `Current value for ${label}`,
    className: 'finger-solo-row__value-input finger-solo-row__value-input--current',
  });
  currentInput.placeholder = 'current';

  const animatedFields = document.createElement('div');
  animatedFields.className = 'finger-solo-row__anim-fields';

  const startInput = createValueInput({
    ariaLabel: `Animation start value for ${label}`,
    className: 'finger-solo-row__value-input finger-solo-row__value-input--start',
  });
  startInput.placeholder = 'start';
  const endInput = createValueInput({
    ariaLabel: `Animation end value for ${label}`,
    className: 'finger-solo-row__value-input finger-solo-row__value-input--end',
  });
  endInput.placeholder = 'end';

  const currentActions = document.createElement('div');
  currentActions.className = 'finger-solo-row__anim-actions';

  const applyStartBtn = document.createElement('button');
  applyStartBtn.type = 'button';
  applyStartBtn.className = 'finger-solo-row__anim-action';
  applyStartBtn.textContent = '⏪';
  applyStartBtn.title = 'Overwrite current value with start value';
  applyStartBtn.setAttribute('aria-label', `Overwrite ${label} with start value`);

  const applyEndBtn = document.createElement('button');
  applyEndBtn.type = 'button';
  applyEndBtn.className = 'finger-solo-row__anim-action';
  applyEndBtn.textContent = '⏩';
  applyEndBtn.title = 'Overwrite current value with end value';
  applyEndBtn.setAttribute('aria-label', `Overwrite ${label} with end value`);

  const recordStartBtn = document.createElement('button');
  recordStartBtn.type = 'button';
  recordStartBtn.className = 'finger-solo-row__anim-action';
  recordStartBtn.textContent = '⏮';
  recordStartBtn.title = 'Record current value as start value';
  recordStartBtn.setAttribute('aria-label', `Record ${label} current value as start`);

  const recordEndBtn = document.createElement('button');
  recordEndBtn.type = 'button';
  recordEndBtn.className = 'finger-solo-row__anim-action';
  recordEndBtn.textContent = '⏭';
  recordEndBtn.title = 'Record current value as end value';
  recordEndBtn.setAttribute('aria-label', `Record ${label} current value as end`);

  currentActions.appendChild(applyStartBtn);
  currentActions.appendChild(applyEndBtn);
  currentActions.appendChild(recordStartBtn);
  currentActions.appendChild(recordEndBtn);

  const animControls = document.createElement('div');
  animControls.className = 'finger-solo-row__anim-controls';

  const toggleAnimBtn = document.createElement('button');
  toggleAnimBtn.type = 'button';
  toggleAnimBtn.className = 'finger-solo-row__anim-toggle';
  toggleAnimBtn.textContent = 'Animate';
  toggleAnimBtn.title = 'Add or remove animation interval';

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'finger-solo-row__anim-play';
  playBtn.textContent = '▶';
  playBtn.title = 'Play this animation (loops); disables dragging this handle while playing';
  playBtn.setAttribute('aria-pressed', 'false');

  animControls.appendChild(toggleAnimBtn);
  animControls.appendChild(playBtn);

  function refresh() {
    const formatted = formatFingerValueForEditor(label);
    display.textContent = formatted;
    const interval = readAnimationIntervalFromQuery(label);
    const animated = Boolean(interval && interval.start && interval.end);
    display.dataset.animated = animated ? 'true' : 'false';
    currentInput.dataset.animated = animated ? 'true' : 'false';
    startInput.dataset.animated = animated ? 'true' : 'false';
    endInput.dataset.animated = animated ? 'true' : 'false';
    if (wrap.dataset.editing !== 'true') {
      currentInput.value = formatted;
    }
    // Sync animation fields when present (but don't stomp the user's in-progress edits).
    if (animated) {
      const startText = formatComplexForQuery(interval.start.x, interval.start.y) || '0+0i';
      const endText = formatComplexForQuery(interval.end.x, interval.end.y) || '0+0i';
      if (wrap.dataset.editing !== 'true' || document.activeElement !== startInput) startInput.value = startText;
      if (wrap.dataset.editing !== 'true' || document.activeElement !== endInput) endInput.value = endText;
    }

    animatedFields.style.display = animated ? 'flex' : 'none';
    currentActions.style.display = animated ? 'flex' : 'none';
    playBtn.disabled = !animated;
    const globalPlayingThis =
      Boolean(animated) &&
      Boolean(animationController?.isPlaying?.()) &&
      Boolean(globalEffectiveTrackLabelSet?.has?.(label));
    const previewPlayingThis =
      Boolean(animated) &&
      Boolean(previewController?.isPlaying?.()) &&
      Boolean(previewLabelSet && previewLabelSet.has(label));
    const playing = globalPlayingThis || previewPlayingThis;
    playBtn.textContent = playing ? '⏸' : '▶';
    playBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');

    // Update animate/remove button label.
    toggleAnimBtn.textContent = animated ? 'Remove animation' : 'Animate';
    toggleAnimBtn.dataset.mode = animated ? 'remove' : 'add';
  }

  function setEditing(nextEditing) {
    wrap.dataset.editing = nextEditing ? 'true' : 'false';
    display.style.display = nextEditing ? 'none' : '';
    // Important: CSS default is `display: none`, so `''` would keep it hidden.
    editor.style.display = nextEditing ? 'flex' : 'none';
    if (nextEditing) {
      currentInput.value = formatFingerValueForEditor(label);
      currentInput.setCustomValidity('');
      // Focus synchronously (mobile browsers may block async focus/keyboard).
      try {
        currentInput.focus({ preventScroll: true });
        currentInput.select();
      } catch (_) {
        // ignore
      }
    }
  }

  let didApplyDuringEdit = false;

  function canonicalize(value) {
    const parsed = parseComplexString(value);
    if (!parsed) return null;
    return formatComplexForQuery(parsed.x, parsed.y);
  }

  function updateAnimatedButtonsEnabledState() {
    const interval = readAnimationIntervalFromQuery(label);
    if (!interval) {
      applyStartBtn.disabled = true;
      applyEndBtn.disabled = true;
      recordStartBtn.disabled = true;
      recordEndBtn.disabled = true;
      return;
    }
    const current = canonicalize(currentInput.value);
    const start = canonicalize(startInput.value);
    const end = canonicalize(endInput.value);
    applyStartBtn.disabled = !(current && start && current !== start);
    applyEndBtn.disabled = !(current && end && current !== end);
    recordStartBtn.disabled = !(current && start && current !== start);
    recordEndBtn.disabled = !(current && end && current !== end);
  }

  function closeAndCommitIfNeeded() {
    setEditing(false);
    refresh();
    updateFingerSoloButtonText();
    if (didApplyDuringEdit && activePointerIds.size === 0) {
      commitHistorySnapshot();
    }
    didApplyDuringEdit = false;
  }

  function applyCurrentValueFromInput() {
    const raw = String(currentInput.value || '').trim();
    const result = applyFingerValueFromEditor(label, raw);
    if (!result.ok) {
      currentInput.setCustomValidity(result.message || 'Invalid value');
      return false;
    }
    currentInput.setCustomValidity('');
    didApplyDuringEdit = true;
    updateFingerSoloButtonText();
    updateAnimatedButtonsEnabledState();
    return true;
  }

  function writeAnimationIntervalFromInputs() {
    const start = parseComplexString(startInput.value);
    const end = parseComplexString(endInput.value);
    if (!start || !end) {
      return false;
    }
    const key = `${label}${ANIMATION_SUFFIX}`;
    const serialized = serializeAnimationInterval({ start, end });
    if (!serialized) {
      return false;
    }
    updateSearchParam(key, serialized);
    // If this parameter is preview-playing, restart it so it picks up the updated interval.
    if (previewLabelSet && previewLabelSet.has(label)) {
      setPreviewLabelPlaying(label, false);
      setPreviewLabelPlaying(label, true);
    }
    refresh();
    updateAnimatedButtonsEnabledState();
    return true;
  }

  display.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setEditing(true);
    refresh();
    updateAnimatedButtonsEnabledState();
  });

  // Live-update the handle as the user types a valid value.
  currentInput.addEventListener('input', () => {
    applyCurrentValueFromInput();
  });

  currentInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      try {
        currentInput.blur();
      } catch (_) {}
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      try {
        currentInput.blur();
      } catch (_) {}
    }
  });

  const onAnimFieldInput = () => {
    // Only persist when both fields parse.
    writeAnimationIntervalFromInputs();
  };
  startInput.addEventListener('input', onAnimFieldInput);
  endInput.addEventListener('input', onAnimFieldInput);

  startInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      try { startInput.blur(); } catch (_) {}
    }
  });
  endInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      try { endInput.blur(); } catch (_) {}
    }
  });

  applyStartBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const start = canonicalize(startInput.value);
    if (!start) return;
    currentInput.value = start;
    applyCurrentValueFromInput();
  });

  applyEndBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const end = canonicalize(endInput.value);
    if (!end) return;
    currentInput.value = end;
    applyCurrentValueFromInput();
  });

  recordStartBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const current = canonicalize(currentInput.value);
    if (!current) return;
    startInput.value = current;
    writeAnimationIntervalFromInputs();
  });

  recordEndBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const current = canonicalize(currentInput.value);
    if (!current) return;
    endInput.value = current;
    writeAnimationIntervalFromInputs();
  });

  toggleAnimBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const interval = readAnimationIntervalFromQuery(label);
    const animated = Boolean(interval && interval.start && interval.end);
    const key = `${label}${ANIMATION_SUFFIX}`;
    if (!animated) {
      // Initialize start/end to the current value.
      const current = parseComplexString(currentInput.value) || reflexCore?.getFingerValue?.(label);
      if (!current || !Number.isFinite(current.x) || !Number.isFinite(current.y)) return;
      const start = { x: current.x, y: current.y };
      const end = { x: current.x, y: current.y };
      const serialized = serializeAnimationInterval({ start, end });
      if (serialized) {
        updateSearchParam(key, serialized);
        refresh();
        updateAnimatedButtonsEnabledState();
      }
      return;
    }
    if (!window.confirm(`Remove animation for ${label}?`)) {
      return;
    }
    // If it was preview-playing, stop it first.
    setPreviewLabelPlaying(label, false);
    updateSearchParam(key, null);
    refresh();
    updateAnimatedButtonsEnabledState();
  });

  playBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const interval = readAnimationIntervalFromQuery(label);
    if (!interval) return;
    // If a global URL animation controller exists, this toggles participation
    // for this label (mute/unmute). Otherwise, it plays this label as a preview loop.
    if (animationController || globalAllTrackLabelSet.has(label)) {
      const currentlyActive = globalEffectiveTrackLabelSet.has(label);
      setGlobalLabelMuted(label, currentlyActive);
      refresh();
      return;
    }

    const isPreviewPlaying = Boolean(previewController?.isPlaying?.() && previewLabelSet && previewLabelSet.has(label));
    setPreviewLabelPlaying(label, !isPreviewPlaying);
    refresh();
  });

  // Close editor + push a single undo frame when focus leaves this control.
  wrap.addEventListener('focusout', (event) => {
    const next = event.relatedTarget;
    if (next && wrap.contains(next)) {
      return;
    }
    closeAndCommitIfNeeded();
  });

  wrap.appendChild(display);
  editor.appendChild(currentInput);
  editor.appendChild(currentActions);
  animatedFields.appendChild(startInput);
  animatedFields.appendChild(endInput);
  editor.appendChild(animatedFields);
  editor.appendChild(animControls);
  wrap.appendChild(editor);
  setEditing(false);
  refresh();
  return { element: wrap, refresh };
}

function updateFingerSoloButtonText() {
  if (!fingerSoloButton) {
    return;
  }
  const soloMode = getSoloModeEnabled();
  fingerSoloButton.dataset.soloMode = soloMode ? 'true' : 'false';

  // Prefer showing live values for the current drag; otherwise keep the last gesture's.
  const activeDragged = getActiveDraggedLabels();
  const displayLabels = activeDragged.length ? activeDragged : pinnedDisplayLabels;
  const filtered = displayLabels.filter((label) => activeFingerState.activeLabelSet.has(label));

  if (!filtered.length) {
    if (!soloMode) {
      fingerSoloButton.textContent = 'Parameters...';
    } else {
      const serialized = serializeSolosParam(soloLabelSet);
      fingerSoloButton.textContent = serialized ? `Solo: ${serialized}` : 'Solo';
    }
    return;
  }

  const lines = filtered.map((label) => {
    const latest = latestOffsets[label] ?? reflexCore?.getFingerValue(label) ?? defaultFingerOffset(label);
    return formatComplexForDisplay(label, latest.x, latest.y);
  });
  fingerSoloButton.textContent = lines.join('\n');

  // Keep the dropdown values in sync while open (without rebuilding DOM).
  refreshFingerSoloValueDisplays();
}

function getActiveDraggedLabels() {
  const core = reflexCore;
  if (!core || !core.pointerStates) {
    return [];
  }
  const labels = new Set();
  for (const state of core.pointerStates.values()) {
    if (state?.role === 'finger' && state?.slot && isFingerLabel(state.slot)) {
      labels.add(state.slot);
    }
    if (state?.role === 'w') {
      // W gestures can move W1/W2 even though pointer state doesn't carry a slot.
      // If W slots are active, show them while a W gesture is in progress.
      (activeFingerState?.wSlots || []).forEach((slot) => {
        if (isFingerLabel(slot)) labels.add(slot);
      });
    }
  }
  return sortFingerLabels(Array.from(labels));
}

function rebuildFingerSoloList() {
  if (!fingerSoloList) {
    return;
  }
  fingerSoloList.innerHTML = '';
  fingerSoloValueRefreshers = [];

  const activeLabels = sortFingerLabels(Array.from(activeFingerState.activeLabelSet));
  if (!activeLabels.length) {
    const empty = document.createElement('div');
    empty.className = 'finger-solo-dropdown__hint';
    empty.textContent = 'No parameters in this formula.';
    fingerSoloList.appendChild(empty);
    if (fingerSoloHint) {
      fingerSoloHint.textContent = 'No parameters to edit.';
    }
    return;
  }

  if (activeLabels.length === 1) {
    if (fingerSoloHint) {
      fingerSoloHint.textContent = 'Click the value to edit this parameter.';
    }

    const label = activeLabels[0];
    const row = document.createElement('div');
    row.className = 'finger-solo-row finger-solo-row--single';
    row.dataset.finger = label;

    const labelEl = document.createElement('div');
    labelEl.className = 'finger-solo-row__label';
    labelEl.textContent = label;

    const valueEditor = buildInlineFingerValueEditor(label);
    fingerSoloValueRefreshers.push(valueEditor.refresh);

    row.appendChild(labelEl);
    row.appendChild(valueEditor.element);
    fingerSoloList.appendChild(row);
    return;
  }

  const soloMode = getSoloModeEnabled();
  if (fingerSoloHint) {
    fingerSoloHint.textContent = soloMode
      ? 'Solo mode: fingers move only checked parameters. Uncheck all so fingers can move all parameters.'
      : 'Fingers can move all parameters. Tap a value to edit. Check any to enable solo mode.';
  }

  for (const label of activeLabels) {
    const row = document.createElement('div');
    row.className = 'finger-solo-row';
    row.dataset.finger = label;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'finger-solo-row__checkbox';
    checkbox.checked = soloLabelSet.has(label);
    checkbox.setAttribute('aria-label', `Solo ${label}`);

    const labelEl = document.createElement('div');
    labelEl.className = 'finger-solo-row__label';
    labelEl.textContent = label;

    const valueEditor = buildInlineFingerValueEditor(label);
    fingerSoloValueRefreshers.push(valueEditor.refresh);

    checkbox.addEventListener('change', (event) => {
      event.stopPropagation();
      const next = new Set(soloLabelSet);
      if (checkbox.checked) {
        next.add(label);
      } else {
        next.delete(label);
      }
      soloLabelSet = next;
      // Keep only labels that are actually in the current formula.
      soloLabelSet = new Set(Array.from(soloLabelSet).filter((l) => activeFingerState.activeLabelSet.has(l)));
      updateSolosQueryParam(soloLabelSet);
      applySoloFilterToRenderer();
      rebuildFingerSoloList();
      updateFingerSoloButtonText();
    });

    row.appendChild(checkbox);
    row.appendChild(labelEl);
    row.appendChild(valueEditor.element);
    fingerSoloList.appendChild(row);
  }
}

function applySoloFilterToRenderer() {
  if (!reflexCore) {
    return;
  }
  const soloMode = getSoloModeEnabled();
  const allowed = soloMode ? new Set(soloLabelSet) : null;
  const blocked = new Set();
  if (previewController?.isPlaying?.()) {
    for (const label of Array.from(previewLabelSet || [])) {
      blocked.add(label);
    }
  }
  if (animationController?.isPlaying?.()) {
    for (const label of Array.from(globalEffectiveTrackLabelSet || [])) {
      blocked.add(label);
    }
  }
  const hasBlocked = blocked.size > 0;

  function filterSlots(list) {
    const arr = Array.isArray(list) ? list : [];
    return arr
      .filter((label) => (allowed ? allowed.has(label) : true))
      .filter((label) => (hasBlocked ? !blocked.has(label) : true));
  }

  const axisConstraints = activeFingerState.axisConstraints instanceof Map
    ? new Map(activeFingerState.axisConstraints)
    : new Map();

  // When soloing, restrict pointer capture, but do NOT change the URL-active label set.
  const fixedSlots = filterSlots(activeFingerState.fixedSlots);
  const dynamicSlots = filterSlots(activeFingerState.dynamicSlots);
  const wSlots = filterSlots(activeFingerState.wSlots);

  // Also update which dots are shown: only capturable labels when in solo mode.
  const visibleSet = new Set(soloMode ? [...fixedSlots, ...dynamicSlots, ...wSlots] : activeFingerState.allSlots);
  syncFingerDots(visibleSet, { soloMode });

  reflexCore.setActiveFingerConfig({
    fixedSlots,
    dynamicSlots,
    wSlots,
    axisConstraints,
  });
}

function syncFingerDots(visibleLabelSet, { soloMode } = {}) {
  const visibleIterable = visibleLabelSet == null ? [] : Array.from(visibleLabelSet);
  const visible = new Set(visibleIterable.filter((l) => isFingerLabel(l)));
  if (fingerOverlay) {
    fingerOverlay.style.display = visible.size ? 'block' : 'none';
  }

  for (const [label, dot] of fingerDots.entries()) {
    if (!visible.has(label)) {
      dot.remove();
      fingerDots.delete(label);
    }
  }

  for (const label of visible) {
    const dot = ensureFingerDot(label);
    if (dot) {
      dot.dataset.soloMode = soloMode ? 'true' : 'false';
    }
  }

  for (const label of visible) {
    updateFingerDotPosition(label);
  }
}

function updateViewportInsets() {
  if (typeof window === 'undefined' || !rootElement) {
    return;
  }
  const viewport = window.visualViewport;
  if (!viewport) {
    rootElement.style.setProperty('--viewport-top-offset', '0px');
    rootElement.style.setProperty('--viewport-bottom-offset', '0px');
    return;
  }
  const topOffset = Math.max(viewport.offsetTop || 0, 0);
  const bottomOffset = Math.max(
    (window.innerHeight || viewport.height || 0) - viewport.height - (viewport.offsetTop || 0),
    0,
  );
  rootElement.style.setProperty('--viewport-top-offset', `${topOffset}px`);
  rootElement.style.setProperty('--viewport-bottom-offset', `${bottomOffset}px`);
}

function setupViewportInsetListeners() {
  if (typeof window === 'undefined') {
    return;
  }
  updateViewportInsets();
  window.addEventListener('resize', updateViewportInsets);
  window.addEventListener('orientationchange', updateViewportInsets);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateViewportInsets);
    window.visualViewport.addEventListener('scroll', updateViewportInsets);
  }
}

setupViewportInsetListeners();

function refreshFingerIndicator(label) {
  ensureFingerState(label);
  // Old per-finger chips are replaced by a single solo control button.
  updateFingerSoloButtonText();
}

const DEFAULT_FORMULA_TEXT = 'z';
let lastAppliedFormulaSource = DEFAULT_FORMULA_TEXT;

const defaultParseResult = parseFormulaInput(DEFAULT_FORMULA_TEXT, getParserOptionsFromFingers());
const fallbackDefaultAST = defaultParseResult.ok ? defaultParseResult.value : createDefaultFormulaAST();
let reflexCore = null;
let scheduledFingerDrivenReparse = false;

// --- Undo/Redo history -------------------------------------------------------
// We snapshot *only* when all pointers are released (no fingers pressed).
// Pointer moves do not create new states; the state is recorded on release.
const HISTORY_LIMIT = 200;
const activePointerIds = new Set();
const historyPast = [];
const historyFuture = [];
let historyApplying = false;
let historyCommitRaf = null;

function compareFingerLabels(a, b) {
  const fa = fingerFamily(a);
  const fb = fingerFamily(b);
  if (fa !== fb) {
    // Keep fixed/dynamic ahead of workspace.
    if (fa === 'w') return 1;
    if (fb === 'w') return -1;
  }
  return fingerIndex(a) - fingerIndex(b);
}

function sortedFingerLabelsForHistory() {
  return Array.from(knownFingerLabels).filter((label) => isFingerLabel(label)).sort(compareFingerLabels);
}

function captureHistorySnapshot() {
  const labels = sortedFingerLabelsForHistory();
  const fingers = {};
  for (const label of labels) {
    ensureFingerState(label);
    const latest = latestOffsets[label] ?? reflexCore?.getFingerValue(label) ?? defaultFingerOffset(label);
    fingers[label] = { x: latest.x, y: latest.y };
  }
  return {
    // Only store formulas that successfully parsed/applied; while the user is
    // typing an invalid formula, history should keep the last valid state.
    formulaSource: String(lastAppliedFormulaSource || DEFAULT_FORMULA_TEXT),
    fingers,
  };
}

function historySnapshotKey(snapshot) {
  if (!snapshot) return '';
  const labels = Object.keys(snapshot.fingers || {}).sort(compareFingerLabels);
  const canonical = {
    formulaSource: snapshot.formulaSource || '',
    fingers: Object.fromEntries(
      labels.map((label) => {
        const v = snapshot.fingers[label] || { x: 0, y: 0 };
        return [label, { x: v.x, y: v.y }];
      }),
    ),
  };
  return JSON.stringify(canonical);
}

function updateUndoRedoButtons() {
  if (undoButton) {
    undoButton.disabled = historyPast.length < 2;
  }
  if (redoButton) {
    redoButton.disabled = historyFuture.length === 0;
  }
}

function commitHistorySnapshot({ force = false } = {}) {
  if (historyApplying) {
    return;
  }
  const snapshot = captureHistorySnapshot();
  const key = historySnapshotKey(snapshot);
  const last = historyPast.length ? historyPast[historyPast.length - 1] : null;
  const lastKey = last ? historySnapshotKey(last) : null;
  if (!force && lastKey === key) {
    updateUndoRedoButtons();
    return;
  }
  historyPast.push(snapshot);
  if (historyPast.length > HISTORY_LIMIT) {
    historyPast.splice(0, historyPast.length - HISTORY_LIMIT);
  }
  historyFuture.length = 0;
  updateUndoRedoButtons();
}

function scheduleCommitHistorySnapshot() {
  if (historyApplying) {
    return;
  }
  if (historyCommitRaf != null || typeof window === 'undefined') {
    return;
  }
  historyCommitRaf = window.requestAnimationFrame(() => {
    historyCommitRaf = null;
    commitHistorySnapshot();
  });
}

function applyHistorySnapshot(snapshot) {
  if (!snapshot) {
    return;
  }
  historyApplying = true;
  try {
    // Stop URL-driven animations to avoid them immediately mutating restored state.
    if (animationController?.isPlaying()) {
      animationController.stop();
    }

    const fingers = snapshot.fingers || {};
    const labels = Object.keys(fingers).filter((label) => isFingerLabel(label)).sort(compareFingerLabels);

    suppressFingerQueryUpdates = true;
    try {
      for (const label of labels) {
        ensureFingerState(label);
        const v = fingers[label];
        if (!v) continue;
        latestOffsets[label] = { x: v.x, y: v.y };
        reflexCore?.setFingerValue(label, v.x, v.y, { triggerRender: false });
      }
    } finally {
      suppressFingerQueryUpdates = false;
    }

    if (formulaTextarea) {
      formulaTextarea.value = snapshot.formulaSource || DEFAULT_FORMULA_TEXT;
    }
    // Apply formula + derived finger activation; allow finger-state changes (no pointer is down).
    applyFormulaFromTextarea({ updateQuery: false, preserveFingerState: false });

    // Persist formula in URL (finger params are handled by applyFingerState).
    const source = formulaTextarea?.value || '';
    updateFormulaQueryParamImmediately(source);
    updateFormulaQueryParam(source).catch((error) =>
      console.warn('Failed to persist formula parameter.', error),
    );

    reflexCore?.render();
  } finally {
    historyApplying = false;
    updateUndoRedoButtons();
  }
}

function undoHistory() {
  if (historyPast.length < 2) {
    return;
  }
  const current = historyPast.pop();
  historyFuture.push(current);
  const previous = historyPast[historyPast.length - 1];
  applyHistorySnapshot(previous);
}

function redoHistory() {
  if (!historyFuture.length) {
    return;
  }
  const next = historyFuture.pop();
  historyPast.push(next);
  applyHistorySnapshot(next);
}

if (undoButton) {
  undoButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    undoHistory();
  });
}

if (redoButton) {
  redoButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    redoHistory();
  });
}

function formulaNeedsFingerDrivenReparse(source) {
  if (!source || typeof source !== 'string') {
    return false;
  }
  // These operators trigger parse-time desugaring / constant-folding that may
  // depend on finger values (e.g. repeat counts and small integer exponents).
  return source.includes('$$') || source.includes('^');
}

function scheduleFingerDrivenReparse() {
  if (scheduledFingerDrivenReparse) {
    return;
  }
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    // Fall back to immediate reparse if rAF is unavailable.
    applyFormulaFromTextarea({ updateQuery: false, preserveFingerState: true });
    return;
  }
  scheduledFingerDrivenReparse = true;
  window.requestAnimationFrame(() => {
    scheduledFingerDrivenReparse = false;
    applyFormulaFromTextarea({ updateQuery: false, preserveFingerState: true });
  });
}

const FINGER_DECIMAL_FACTOR = 10 ** FINGER_DECIMAL_PLACES;

function roundToFingerPrecision(value) {
  if (!Number.isFinite(value)) {
    return NaN;
  }
  const rounded = Math.round(value * FINGER_DECIMAL_FACTOR) / FINGER_DECIMAL_FACTOR;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatNumberForDisplay(value) {
  const rounded = roundToFingerPrecision(value);
  if (!Number.isFinite(rounded)) {
    return '?';
  }
  return rounded.toFixed(FINGER_DECIMAL_PLACES).replace(/\.?0+$/, '');
}

function formatComplexForDisplay(label, re, im) {
  if (!Number.isFinite(re) || !Number.isFinite(im)) {
    return `${label} = ?`;
  }
  const sign = im >= 0 ? '+' : '-';
  const realPart = formatNumberForDisplay(re);
  const imagPart = formatNumberForDisplay(Math.abs(im));
  return `${label} = ${realPart} ${sign} ${imagPart} i`;
}

function formatComplexForQuery(re, im) {
  if (!Number.isFinite(re) || !Number.isFinite(im)) {
    return null;
  }
  const sign = im >= 0 ? '+' : '-';
  const realPart = formatNumberForDisplay(re);
  const imagPart = formatNumberForDisplay(Math.abs(im));
  return `${realPart}${sign}${imagPart}i`;
}

function parseComplexString(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\s+/g, '').toLowerCase();

  if (normalized.endsWith('i')) {
    const core = normalized.slice(0, -1);
    // Support shorthand imaginary values:
    // - "i"   -> 0+1i
    // - "+i"  -> 0+1i
    // - "-i"  -> 0-1i
    // - "2i"  -> 0+2i
    // - "-2i" -> 0-2i
    if (!core.length || core === '+') {
      return { x: 0, y: 1 };
    }
    if (core === '-') {
      return { x: 0, y: -1 };
    }
    let splitIdx = -1;
    for (let i = core.length - 1; i > 0; i--) {
      const ch = core[i];
      if (ch === '+' || ch === '-') {
        splitIdx = i;
        break;
      }
    }
    if (splitIdx !== -1) {
      const realPart = core.slice(0, splitIdx) || '0';
      const imagPart = core.slice(splitIdx) || '0';
      const re = Number(realPart);
      const im = Number(imagPart);
      if (Number.isFinite(re) && Number.isFinite(im)) {
        return { x: re, y: im };
      }
    } else {
      // Pure imaginary magnitude like "2i" / "-0.5i".
      const im = Number(core);
      if (Number.isFinite(im)) {
        return { x: 0, y: im };
      }
    }
  }

  const tupleParts = normalized.split(',');
  if (tupleParts.length === 2) {
    const re = Number(tupleParts[0]);
    const im = Number(tupleParts[1]);
    if (Number.isFinite(re) && Number.isFinite(im)) {
      return { x: re, y: im };
    }
  }

  const realValue = Number(normalized);
  if (Number.isFinite(realValue)) {
    return { x: realValue, y: 0 };
  }

  return null;
}

function parseSecondsFromQuery(raw) {
  if (raw == null) {
    return null;
  }
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  const numeric = trimmed.endsWith('s') ? trimmed.slice(0, -1) : trimmed;
  const seconds = Number(numeric);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return seconds;
}

function formatSecondsForQuery(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const normalized = Math.round(seconds * 1000) / 1000;
  return `${normalized}s`;
}

function parseComplexInterval(raw) {
  if (!raw) {
    return null;
  }
  const normalized = String(raw).trim().replace(/\s+/g, '');
  if (!normalized || normalized.includes(';') || normalized.includes('|')) {
    return null;
  }
  const parts = normalized.split('..');
  if (parts.length !== 2) {
    return null;
  }
  const start = parseComplexString(parts[0]);
  const end = parseComplexString(parts[1]);
  if (!start || !end) {
    return null;
  }
  return { start, end };
}

function readAnimationIntervalFromQuery(label) {
  const params = new URLSearchParams(window.location.search);
  const key = `${label}${ANIMATION_SUFFIX}`;
  const raw = params.get(key);
  return parseComplexInterval(raw);
}

function serializeAnimationInterval(interval) {
  if (!interval) {
    return null;
  }
  const start = interval?.start;
  const end = interval?.end;
  const startText = start ? formatComplexForQuery(start.x, start.y) : null;
  const endText = end ? formatComplexForQuery(end.x, end.y) : null;
  if (!startText || !endText) {
    return null;
  }
  return `${startText}..${endText}`;
}

function updateSearchParam(key, valueOrNull) {
  const params = new URLSearchParams(window.location.search);
  if (valueOrNull == null || valueOrNull === '') {
    params.delete(key);
  } else {
    params.set(key, String(valueOrNull));
  }
  replaceUrlSearch(params);
}

function hasFormulaQueryParam() {
  const params = new URLSearchParams(window.location.search);
  return params.has(FORMULA_PARAM) || params.has(FORMULA_B64_PARAM);
}

function isEditModeEnabled() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(EDIT_PARAM);
  if (!raw) {
    return false;
  }
  const normalized = String(raw).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function isEditModeActive() {
  return sessionEditMode || isEditModeEnabled();
}

function enterEditModeForSession() {
  sessionEditMode = true;
  revealViewerModeUIOnce();
}

function setViewerModeActive(active) {
  viewerModeActive = Boolean(active);
  if (!rootElement) {
    return;
  }
  rootElement.classList.toggle('viewer-mode', viewerModeActive && !viewerModeRevealed);
}

function revealViewerModeUIOnce() {
  if (!viewerModeActive || viewerModeRevealed) {
    return;
  }
  viewerModeRevealed = true;
  if (rootElement) {
    rootElement.classList.remove('viewer-mode');
  }
}

function ensureFingerIndicator(label) {
  // Deprecated: per-finger indicators are no longer rendered.
  return null;
}

function ensureFingerDot(label) {
  if (!fingerOverlay) {
    return null;
  }
  if (fingerDots.has(label)) {
    return fingerDots.get(label);
  }
  ensureFingerState(label);
  const meta = getFingerMeta(label);
  const dot = document.createElement('div');
  dot.className = `finger-dot finger-dot--${meta.type}`;
  dot.dataset.fingerDot = label;
  dot.textContent = label;
  fingerOverlay.appendChild(dot);
  fingerDots.set(label, dot);
  return dot;
}

function promptFingerValue(label) {
  const currentOffset = reflexCore?.getFingerValue(label) ?? { x: 0, y: 0 };
  const currentValue = formatComplexForQuery(currentOffset.x, currentOffset.y) || '0+0i';
  const next = window.prompt(`Set ${label} (formats: "a+bi" or "a,b")`, currentValue);
  if (next === null) {
    return;
  }
  const parsed = parseComplexString(next);
  if (!parsed) {
    alert(`Could not parse ${label}. Use "a+bi" or "real,imag".`);
    return;
  }
  if (!reflexCore) {
    alert('Unable to edit finger values because the renderer is unavailable.');
    return;
  }
  reflexCore.setFingerValue(label, parsed.x, parsed.y);
  if (activePointerIds.size === 0) {
    scheduleCommitHistorySnapshot();
  }
}

function readFingerFromQuery(label) {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(label);
  return parseComplexString(raw);
}

function persistLastSearchToLocalStorage(search) {
  try {
    window.localStorage?.setItem(LAST_STATE_SEARCH_KEY, String(search || ''));
  } catch (_) {
    // ignore storage failures
  }
}

function clearPersistedLastSearch() {
  try {
    window.localStorage?.removeItem(LAST_STATE_SEARCH_KEY);
  } catch (_) {
    // ignore storage failures
  }
}

function restorePersistedSearchIfNeeded() {
  if (typeof window === 'undefined') {
    return;
  }
  const params = new URLSearchParams(window.location.search);
  // If opened via a share link (formula embedded), do not override it.
  if (params.has(FORMULA_PARAM) || params.has(FORMULA_B64_PARAM)) {
    return;
  }
  let saved = null;
  try {
    saved = window.localStorage?.getItem(LAST_STATE_SEARCH_KEY);
  } catch (_) {
    saved = null;
  }
  if (!saved || typeof saved !== 'string' || !saved.startsWith('?')) {
    return;
  }
  const savedParams = new URLSearchParams(saved.slice(1));
  if (!savedParams.has(FORMULA_PARAM) && !savedParams.has(FORMULA_B64_PARAM)) {
    return;
  }
  const current = window.location.search || '';
  if (current === saved) {
    return;
  }
  window.history.replaceState({}, '', `${window.location.pathname}${saved}`);
}

function updateFingerQueryParam(label, re, im) {
  const serialized = formatComplexForQuery(re, im);
  const params = new URLSearchParams(window.location.search);
  if (serialized) {
    params.set(label, serialized);
  } else {
    params.delete(label);
  }
  const newQuery = params.toString();
  const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}`;
  window.history.replaceState({}, '', newUrl);
  persistLastSearchToLocalStorage(newQuery ? `?${newQuery}` : '');
}

function clearFingerQueryParam(label) {
  fingerLastSerialized[label] = null;
  updateFingerQueryParam(label, Number.NaN, Number.NaN);
}

function handleFingerValueChange(label, offset) {
  ensureFingerState(label);
  latestOffsets[label] = { x: offset.x, y: offset.y };
  refreshFingerIndicator(label);
  updateFingerDotPosition(label);
  if (activePointerIds.size > 0 && activeFingerState.activeLabelSet.has(label)) {
    currentGestureTouchedLabels.add(label);
  }
  if (!suppressFingerQueryUpdates && activeFingerState.activeLabelSet.has(label)) {
    const serialized = formatComplexForQuery(offset.x, offset.y);
    if (serialized !== fingerLastSerialized[label]) {
      fingerLastSerialized[label] = serialized;
      updateFingerQueryParam(label, offset.x, offset.y);
    }
  }

  // If the current formula performs finger-dependent desugaring (e.g. `$$` repeat
  // counts), a finger move must re-run the parse/desugar pipeline so the shader
  // reflects the updated constant-folded structure.
  if (
    !suppressFingerQueryUpdates &&
    activeFingerState.activeLabelSet.has(label) &&
    formulaNeedsFingerDrivenReparse(formulaTextarea?.value || '')
  ) {
    scheduleFingerDrivenReparse();
  }
}

function showError(msg) {
  if (fatalErrorActive) {
    return;
  }
  errorDiv.removeAttribute('data-error-severity');
  try {
    errorDiv.innerHTML = '';
  } catch (_) {
    // ignore
  }
  errorDiv.textContent = msg;
  errorDiv.style.display = 'block';
}

function showFatalError(msg) {
  fatalErrorActive = true;
  errorDiv.setAttribute('data-error-severity', 'fatal');
  try {
    errorDiv.innerHTML = '';
  } catch (_) {
    // ignore
  }

  const content = document.createElement('div');
  content.textContent = String(msg || '');

  const actions = document.createElement('div');
  actions.className = 'error-actions';

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.textContent = 'Copy';
  copyButton.title = 'Copy error details';

  async function copyText(text) {
    const value = String(text || '');
    const clipboard = navigator?.clipboard;
    if (clipboard && typeof clipboard.writeText === 'function') {
      await clipboard.writeText(value);
      return true;
    }
    return false;
  }

  copyButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const original = copyButton.textContent;
    try {
      const ok = await copyText(msg);
      if (!ok) {
        // Fallback for older browsers / insecure contexts.
        window.prompt('Copy this error:', String(msg || ''));
      }
      copyButton.textContent = 'Copied';
      window.setTimeout(() => {
        if (copyButton.textContent === 'Copied') {
          copyButton.textContent = original;
        }
      }, 1200);
    } catch (e) {
      console.warn('Failed to copy error text.', e);
      try {
        window.prompt('Copy this error:', String(msg || ''));
      } catch (_) {
        // ignore
      }
    }
  });

  actions.appendChild(copyButton);
  errorDiv.appendChild(content);
  errorDiv.appendChild(actions);
  errorDiv.style.display = 'block';
}

function clearError() {
  if (fatalErrorActive) {
    return;
  }
  errorDiv.removeAttribute('data-error-severity');
  errorDiv.style.display = 'none';
  try {
    errorDiv.innerHTML = '';
  } catch (_) {
    errorDiv.textContent = '';
  }
}

function handleRendererInitializationFailure(error) {
  const reason =
    error && typeof error.message === 'string' && error.message.length
      ? error.message
      : 'Unknown error';
  const guidance = [
    'Reflex4You could not initialize the WebGL2 renderer.',
    'Rendering and gesture controls are disabled.',
    `Details: ${reason}`,
    'Try enabling WebGL2 or switch to a browser/device that supports it.',
  ].join('\n');
  if (canvas) {
    canvas.classList.add('glcanvas--unavailable');
    canvas.setAttribute('aria-disabled', 'true');
  }
  showFatalError(guidance);
}

function scheduleReloadOnceForContextLoss() {
  if (typeof window === 'undefined' || typeof window.location?.reload !== 'function') {
    return;
  }
  let already = false;
  try {
    already = Boolean(window.sessionStorage?.getItem(CONTEXT_LOSS_RELOAD_KEY));
  } catch (_) {
    already = false;
  }
  if (already) {
    return;
  }
  try {
    window.sessionStorage?.setItem(CONTEXT_LOSS_RELOAD_KEY, String(Date.now()));
  } catch (_) {
    // ignore
  }
  window.setTimeout(() => {
    try {
      window.location.reload();
    } catch (_) {
      // ignore
    }
  }, 250);
}

function noteAppHiddenTimestamp() {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage?.setItem(LAST_HIDDEN_AT_KEY, String(Date.now()));
  } catch (_) {
    // ignore storage failures
  }
}

function maybeReloadAfterLongBackground() {
  if (typeof window === 'undefined' || typeof window.location?.reload !== 'function') {
    return;
  }
  let hiddenAt = null;
  try {
    const raw = window.sessionStorage?.getItem(LAST_HIDDEN_AT_KEY);
    hiddenAt = raw ? Number(raw) : null;
  } catch (_) {
    hiddenAt = null;
  }
  if (!Number.isFinite(hiddenAt) || hiddenAt == null) {
    return;
  }
  const elapsed = Date.now() - hiddenAt;
  if (!Number.isFinite(elapsed) || elapsed < RESUME_RELOAD_THRESHOLD_MS) {
    return;
  }
  let already = false;
  try {
    already = Boolean(window.sessionStorage?.getItem(RESUME_RELOAD_KEY));
  } catch (_) {
    already = false;
  }
  if (already) {
    return;
  }
  try {
    window.sessionStorage?.setItem(RESUME_RELOAD_KEY, String(Date.now()));
  } catch (_) {
    // ignore
  }
  // Persist current URL state before reloading, so a resumed reload doesn't lose work.
  try {
    persistLastSearchToLocalStorage(window.location.search || '');
  } catch (_) {
    // ignore
  }
  window.setTimeout(() => {
    try {
      window.location.reload();
    } catch (_) {
      // ignore
    }
  }, 50);
}

function maybeRecoverFromWebglContextLoss() {
  const gl = reflexCore?.gl;
  if (!gl || typeof gl.isContextLost !== 'function') {
    return;
  }
  if (!gl.isContextLost()) {
    return;
  }
  showFatalError(
    [
      'Graphics context was lost (common after being backgrounded on mobile PWAs).',
      'Reloading the app to recover…',
    ].join('\n'),
  );
  scheduleReloadOnceForContextLoss();
}

function showParseError(source, failure) {
  showError(formatCaretIndicator(source, failure));
}

function analyzeFingerUsage(ast) {
  const usage = {
    fixed: new Set(),
    dynamic: new Set(),
    w: new Set(),
  };
  const axisBuckets = new Map();
  if (!ast) {
    return { usage, axisConstraints: new Map() };
  }
  visitAst(ast, (node, meta) => {
    if (node.kind !== 'FingerOffset') {
      return;
    }
    const slot = node.slot;
    const family = slot.startsWith('F') ? 'fixed' : slot.startsWith('D') ? 'dynamic' : 'w';
    usage[family].add(slot);
    const axisKind = resolveAxisContext(meta.parent, node);
    const bucket = axisBuckets.get(slot) || new Set();
    bucket.add(axisKind);
    axisBuckets.set(slot, bucket);
  });
  const axisConstraints = new Map();
  axisBuckets.forEach((bucket, slot) => {
    if (bucket.size === 1 && bucket.has('x')) {
      axisConstraints.set(slot, 'x');
    } else if (bucket.size === 1 && bucket.has('y')) {
      axisConstraints.set(slot, 'y');
    }
  });
  return { usage, axisConstraints };
}

function resolveAxisContext(parent, node) {
  if (
    parent &&
    parent.kind === 'Compose' &&
    parent.g === node &&
    parent.f &&
    (parent.f.kind === 'VarX' || parent.f.kind === 'VarY')
  ) {
    return parent.f.kind === 'VarX' ? 'x' : 'y';
  }
  return 'other';
}

function deriveFingerState(analysis) {
  const fixedSlots = sortFingerLabels(Array.from(analysis.usage.fixed));
  const dynamicSlots = sortFingerLabels(Array.from(analysis.usage.dynamic));
  const usesW0 = analysis.usage.w.has('W0');
  const usesW2 = analysis.usage.w.has('W2');
  if (usesW0 && usesW2) {
    return {
      mode: 'invalid',
      fixedSlots: [],
      dynamicSlots: [],
      wSlots: [],
      axisConstraints: new Map(),
      error: 'Formulas cannot mix W0 with W2. Use W0/W1 or W1/W2.',
    };
  }

  // If W0 is present, it takes over the workspace pair: always activate W0+W1.
  // Otherwise, keep the legacy W1/W2 behavior (only activate labels that appear).
  const wSlots = usesW0
    ? W_PAIR_ZERO.slice()
    : W_PAIR_LEGACY.filter((label) => analysis.usage.w.has(label));
  // Mixed fixed+dynamic is allowed. Interaction is resolved at runtime:
  // the first non-W finger chooses whether to latch onto fixed or dynamic.
  const mode = fixedSlots.length && dynamicSlots.length
    ? 'mixed'
    : fixedSlots.length
      ? 'fixed'
      : dynamicSlots.length
        ? 'dynamic'
        : 'none';
  const axisConstraints = new Map();
  [...fixedSlots, ...dynamicSlots, ...wSlots].forEach((label) => {
    if (analysis.axisConstraints.has(label)) {
      axisConstraints.set(label, analysis.axisConstraints.get(label));
    }
  });
  return {
    mode,
    fixedSlots,
    dynamicSlots,
    wSlots,
    axisConstraints,
  };
}

function syncFingerUI() {
  const activeLabels = activeFingerState.allSlots;
  if (fingerIndicatorStack) {
    fingerIndicatorStack.style.display = activeLabels.length ? 'flex' : 'none';
  }
}

function applyFingerState(state) {
  const previousActiveLabelSet =
    activeFingerState?.activeLabelSet instanceof Set ? new Set(activeFingerState.activeLabelSet) : new Set();

  const axisConstraints = state.axisConstraints instanceof Map ? state.axisConstraints : new Map();
  const allSlots = [
    ...(state.fixedSlots || []),
    ...(state.dynamicSlots || []),
    ...(state.wSlots || []),
  ];
  allSlots.forEach((label) => ensureFingerState(label));
  activeFingerState = {
    mode: state.mode,
    fixedSlots: state.fixedSlots || [],
    dynamicSlots: state.dynamicSlots || [],
    wSlots: state.wSlots || [],
    axisConstraints,
    allSlots,
    activeLabelSet: new Set(allSlots),
  };

  // Read solos from the URL and normalize to current active labels.
  const paramsForSolos = new URLSearchParams(window.location.search);
  const parsedSolos = parseSolosParam(paramsForSolos.get(SOLOS_PARAM));
  soloLabelSet = new Set(Array.from(parsedSolos).filter((l) => activeFingerState.activeLabelSet.has(l)));

  let solosChanged = serializeSolosParam(parsedSolos) !== serializeSolosParam(soloLabelSet);

  // If already in solo mode, auto-solo *newly introduced* finger constants.
  // Do this only after the first apply, otherwise reloads would incorrectly
  // expand solos to include everything.
  if (hasAppliedFingerStateOnce && soloLabelSet.size > 0) {
    for (const label of activeFingerState.activeLabelSet) {
      if (!previousActiveLabelSet.has(label) && !soloLabelSet.has(label)) {
        soloLabelSet.add(label);
        solosChanged = true;
      }
    }
  }

  // Keep URL canonical (drop inactive solos / persist auto-solo additions).
  if (solosChanged) {
    updateSolosQueryParam(soloLabelSet);
  }

  ensureFingerSoloUI();
  rebuildFingerSoloList();

  // Drop any preview/global mute labels that are no longer active in the formula.
  previewLabelSet = new Set(Array.from(previewLabelSet || []).filter((l) => activeFingerState.activeLabelSet.has(l)));
  globalMutedLabelSet = new Set(Array.from(globalMutedLabelSet || []).filter((l) => activeFingerState.activeLabelSet.has(l)));
  // Recompute track label sets after pruning.
  try {
    const { all } = buildEffectiveGlobalTracksFromQuery();
    recomputeGlobalTrackLabelSets(all);
  } catch (_) {
    // ignore
  }

  ensureFingerSubscriptions(activeFingerState.allSlots);
  syncFingerUI();

  // Apply capture restrictions (and dot visibility) based on solos.
  applySoloFilterToRenderer();
  updateFingerSoloButtonText();

  // Keep the URL in sync with the *current formula's* active finger set.
  // When fingers disappear from the formula, we must remove both:
  // - their value params (e.g. D2=...)
  // - their animation params (e.g. D2A=...),
  // otherwise stale intervals can later "revive" and unexpectedly animate.
  const params = new URLSearchParams(window.location.search);
  pruneFingerUrlParams(params, {
    knownLabels: Array.from(knownFingerLabels),
    activeLabels: activeFingerState.allSlots,
    animationSuffix: ANIMATION_SUFFIX,
    animationTimeParam: ANIMATION_TIME_PARAM,
  });

  // Reset per-finger serialized cache for any now-inactive labels.
  Array.from(knownFingerLabels).forEach((label) => {
    if (!activeFingerState.activeLabelSet.has(label)) {
      fingerLastSerialized[label] = null;
      const dot = fingerDots.get(label);
      if (dot) {
        dot.classList.remove('visible');
      }
    }
  });

  // Write the active finger values into the query params in a single replaceState call.
  for (const label of activeFingerState.allSlots) {
    const latest = latestOffsets[label];
    const serialized = formatComplexForQuery(latest.x, latest.y);
    fingerLastSerialized[label] = serialized;
    if (serialized) {
      params.set(label, serialized);
    } else {
      params.delete(label);
    }
  }
  replaceUrlSearch(params);

  // If URL-driven animations are currently playing, keep the running controller
  // aligned with the now-active finger set (and stop if animations are no longer applicable).
  if (animationController?.isPlaying()) {
    const tracks = buildAnimationTracksFromQuery();
    if (!tracks.size || isEditModeActive()) {
      animationController.stop();
    } else {
      startAnimations(tracks);
    }
  }

  hasAppliedFingerStateOnce = true;
}

function updateFingerDotPosition(label) {
  ensureFingerState(label);
  const dot = fingerDots.get(label);
  if (!dot || !reflexCore || !activeFingerState.activeLabelSet.has(label)) {
    if (dot) {
      dot.classList.remove('visible');
    }
    return;
  }
  const latest = latestOffsets[label];
  const projection = reflexCore.projectComplexToCanvasNormalized(latest.x, latest.y);
  if (
    !projection ||
    !Number.isFinite(projection.u) ||
    !Number.isFinite(projection.v) ||
    projection.u < 0 ||
    projection.u > 1 ||
    projection.v < 0 ||
    projection.v > 1
  ) {
    dot.classList.remove('visible');
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const left = rect.left + projection.u * rect.width;
  const top = rect.top + (1 - projection.v) * rect.height;
  dot.style.left = `${left}px`;
  dot.style.top = `${top}px`;
  dot.classList.add('visible');
}

async function bootstrapReflexApplication() {
  // Installed PWAs often relaunch at `start_url` without the last query string.
  // Restore the last known reflex state unless the user opened an explicit share link.
  // This also improves the non-installed experience (reloads keep state).
  restorePersistedSearchIfNeeded();

  await verifyCompressionSupport();

  const editEnabled = isEditModeActive();
  const shouldStartInViewerMode = hasFormulaQueryParam() && !editEnabled;
  setViewerModeActive(shouldStartInViewerMode);

  // Any interaction reveals the UI when in viewer mode.
  if (typeof window !== 'undefined') {
    const reveal = () => revealViewerModeUIOnce();
    window.addEventListener('pointerdown', reveal, { once: true, capture: true });
    window.addEventListener('keydown', reveal, { once: true, capture: true });
  }

  const params = new URLSearchParams(window.location.search);
  animationSeconds = parseSecondsFromQuery(params.get(ANIMATION_TIME_PARAM)) ?? DEFAULT_ANIMATION_SECONDS;

  let initialFormulaSource = await readFormulaFromQuery({
    onDecodeError: () => {
      showError('We could not decode the formula embedded in this link. Resetting to the default formula.');
    },
  });
  if (!initialFormulaSource || !initialFormulaSource.trim()) {
    initialFormulaSource = DEFAULT_FORMULA_TEXT;
  }

  const initialParse = parseFormulaInput(initialFormulaSource, getParserOptionsFromFingers());
  let initialAST;

  if (initialParse.ok) {
    initialAST = initialParse.value;
    clearError();
  } else {
    console.warn('Failed to parse initial formula, rendering fallback AST.', initialParse);
    initialAST = fallbackDefaultAST;
    showParseError(initialFormulaSource, initialParse);
  }

  const initialUsage = analyzeFingerUsage(initialAST);
  const initialFingerState = deriveFingerState(initialUsage);
  if (initialFingerState.mode === 'invalid') {
    showError(initialFingerState.error);
  }

  formulaTextarea.value = initialFormulaSource;
  if (initialParse.ok) {
    lastAppliedFormulaSource = initialFormulaSource;
  }

  try {
    reflexCore = new ReflexCore(canvas, initialAST);
  } catch (err) {
    console.error('Failed to initialize Reflex4You renderer', err);
    handleRendererInitializationFailure(err);
  }

  if (reflexCore) {
    if (typeof window !== 'undefined') {
      window.__reflexCore = reflexCore;
    }
    // Subscribe only to the finger labels that are actually used.
    const initialActiveLabels = initialFingerState.mode === 'invalid'
      ? ALL_W_FINGER_LABELS
      : [
        ...(initialFingerState.fixedSlots || []),
        ...(initialFingerState.dynamicSlots || []),
        ...(initialFingerState.wSlots || []),
      ];
    ensureFingerSubscriptions(initialActiveLabels);
    applyFingerValuesFromQuery(initialActiveLabels);
  }

  if (initialFingerState.mode !== 'invalid') {
    applyFingerState(initialFingerState);
  } else {
    applyFingerState(createEmptyFingerState());
  }

  if (reflexCore) {
    canvas.addEventListener('pointerdown', (e) => reflexCore.handlePointerDown(e));
    canvas.addEventListener('pointermove', (e) => reflexCore.handlePointerMove(e));
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
      canvas.addEventListener(type, (e) => reflexCore.handlePointerEnd(e));
    });
  } else if (canvas) {
    canvas.style.pointerEvents = 'none';
  }

  // Track active pointers so we can snapshot only when all fingers are released.
  if (canvas && typeof window !== 'undefined') {
    canvas.addEventListener('pointerdown', (event) => {
      if (activePointerIds.size === 0) {
        currentGestureTouchedLabels = new Set();
      }
      activePointerIds.add(event.pointerId);
      updateFingerSoloButtonText();
    });
    const handlePointerEndForHistory = (event) => {
      activePointerIds.delete(event.pointerId);
      if (activePointerIds.size === 0) {
        pinnedDisplayLabels = sortFingerLabels(Array.from(currentGestureTouchedLabels));
        currentGestureTouchedLabels = new Set();
      }
      updateFingerSoloButtonText();
      if (activePointerIds.size === 0) {
        scheduleCommitHistorySnapshot();
      }
    };
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
      canvas.addEventListener(type, handlePointerEndForHistory);
    });
  }

  // Load any animation intervals from the URL and start animating (unless edit mode).
  if (reflexCore) {
    const { all, effective } = buildEffectiveGlobalTracksFromQuery();
    if (all.size) {
      // Start values always apply (so the UI matches the interval start when opening a share link).
      applyAnimationStartValues(all);
      if (!editEnabled && effective.size) {
        startAnimations(effective);
      }
    }
  }

  // Seed the undo stack with the initial ready state.
  commitHistorySnapshot({ force: true });
}

const bootstrapPromise = bootstrapReflexApplication();
if (typeof window !== 'undefined') {
  window.__reflexReady = bootstrapPromise;
}
bootstrapPromise.catch((error) => {
  console.error('Failed to bootstrap Reflex4You.', error);
  const details =
    error && (error.stack || error.message)
      ? String(error.stack || error.message)
      : String(error || 'Unknown error');

  const htmlBuild = typeof window !== 'undefined' ? window.__reflexHtmlBuildId : null;
  const jsBuild = typeof window !== 'undefined' ? window.__reflexJsBuildId : null;
  const controller = navigator?.serviceWorker?.controller?.scriptURL || 'none';

  const guidance = [
    'Unable to initialize Reflex4You.',
    '',
    `Build markers: html=${htmlBuild || 'unknown'} js=${jsBuild || 'unknown'}`,
    `SW controller: ${controller}`,
    '',
    details,
    '',
    'Recovery tips:',
    '- Hard reload (or open in a private window).',
    '- If installed as a PWA: uninstall/reinstall or clear the site data.',
  ].join('\n');
  showFatalError(guidance);

  // One-time cache-busting reload: helps recover from stale SW/cached modules.
  try {
    if (typeof window !== 'undefined' && window.sessionStorage && window.location) {
      const key = `reflex4you:initReloaded:v${APP_VERSION}`;
      const already = Boolean(window.sessionStorage.getItem(key));
      if (!already) {
        window.sessionStorage.setItem(key, String(Date.now()));
        const url = new URL(window.location.href);
        url.searchParams.set('initfix', String(Date.now()));
        window.location.replace(url.toString());
      }
    }
  } catch (_) {
    // ignore reload failures
  }
});

if (typeof window !== 'undefined') {
  // Surface unexpected runtime errors in-app on mobile, where devtools are harder.
  window.addEventListener('error', (event) => {
    const message =
      event?.error?.stack ||
      event?.error?.message ||
      event?.message ||
      'Unknown error';
    console.error('Uncaught error', event?.error || event);
    showFatalError(`Uncaught error:\n${message}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const message =
      reason?.stack ||
      reason?.message ||
      (typeof reason === 'string' ? reason : null) ||
      'Unknown rejection';
    console.error('Unhandled promise rejection', reason);
    showFatalError(`Unhandled promise rejection:\n${message}`);
  });
}

if (canvas) {
  // If the WebGL context is lost, the most reliable recovery in mobile PWAs is a reload.
  canvas.addEventListener(
    'webglcontextlost',
    (event) => {
      try {
        event.preventDefault();
      } catch (_) {
        // ignore
      }
      showFatalError(
        [
          'Graphics context was lost (common after being backgrounded on mobile PWAs).',
          'Reloading the app to recover…',
        ].join('\n'),
      );
      scheduleReloadOnceForContextLoss();
    },
    false,
  );
  canvas.addEventListener(
    'webglcontextrestored',
    () => {
      // ReflexCore will attempt to rebuild GPU resources, but also re-check after restore.
      maybeRecoverFromWebglContextLoss();
    },
    false,
  );
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      noteAppHiddenTimestamp();
      return;
    }
    // If the OS backgrounded/suspended the app for long enough, proactively reload.
    // This avoids a "blank UI" state where the GPU/canvas/event loop never recovers.
    maybeReloadAfterLongBackground();
    if (!document.hidden) {
      maybeRecoverFromWebglContextLoss();
    }
  });
}
if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', () => {
    maybeReloadAfterLongBackground();
    maybeRecoverFromWebglContextLoss();
  });
}

formulaTextarea.addEventListener('focus', () => {
  formulaTextarea.classList.add('expanded');
});
formulaTextarea.addEventListener('blur', () => {
  formulaTextarea.classList.remove('expanded');
});
// Commit formula edits as a single undoable state once editing is "done"
// (change fires on blur for textarea edits).
formulaTextarea.addEventListener('change', () => {
  if (activePointerIds.size === 0) {
    commitHistorySnapshot();
  }
});

function applyFormulaFromTextarea({ updateQuery = true, preserveFingerState = false } = {}) {
  const source = formulaTextarea.value;
  if (!source.trim()) {
    showError('Formula cannot be empty.');
    return;
  }
  const result = parseFormulaInput(source, getParserOptionsFromFingers());
  if (!result.ok) {
    showParseError(source, result);
    return;
  }
  const usage = analyzeFingerUsage(result.value);
  const nextState = deriveFingerState(usage);
  if (nextState.mode === 'invalid') {
    showError(nextState.error);
    return;
  }
  clearError();
  lastAppliedFormulaSource = source;
  reflexCore?.setFormulaAST(result.value);
  // Finger-driven reparses happen while a pointer is down (e.g. `$$` repeat counts
  // derived from D1). Re-applying the finger state would call into ReflexCore's
  // `setActiveFingerConfig`, which intentionally releases pointer capture and
  // clears active pointer assignments — interrupting the drag mid-gesture.
  if (!preserveFingerState) {
    applyFingerState(nextState);
  }
  if (updateQuery) {
    // Update immediately (tests + deterministic sharing), then try to upgrade
    // to the compressed param asynchronously when supported.
    updateFormulaQueryParamImmediately(source);
    updateFormulaQueryParam(source).catch((error) =>
      console.warn('Failed to persist formula parameter.', error),
    );
  }
}

formulaTextarea.addEventListener('input', () => applyFormulaFromTextarea());

window.addEventListener('resize', () => {
  activeFingerState.allSlots.forEach((label) => updateFingerDotPosition(label));
});

setupMenuDropdown({ menuButton, menuDropdown, onAction: handleMenuAction });

function handleMenuAction(action) {
  switch (action) {
    case 'copy-share-link':
      copyShareLinkToClipboard().catch((error) => {
        console.warn('Failed to copy share link.', error);
      });
      break;
    case 'open-explore':
      window.location.href = `./explore.html${window.location.search || ''}`;
      break;
    case 'reset':
      confirmAndReset();
      break;
    case 'set-animation-start':
      setAnimationStartFromCurrent();
      break;
    case 'set-animation-end':
      commitHistorySnapshot();
      setAnimationEndFromCurrent();
      scheduleCommitHistorySnapshot();
      break;
    case 'set-animation-time':
      commitHistorySnapshot();
      promptAndSetAnimationTime();
      scheduleCommitHistorySnapshot();
      break;
    case 'save-image':
      saveCanvasImage().catch((error) => {
        console.error('Failed to save canvas image.', error);
        alert('Unable to save image. Check console for details.');
      });
      break;
    case 'open-formula-view':
      window.location.href = `./formula.html${window.location.search || ''}`;
      break;
    default:
      break;
  }
}

async function buildShareUrl() {
  const href = typeof window !== 'undefined' ? window.location.href : '';
  const url = new URL(href);
  url.hash = '';

  const params = new URLSearchParams(url.search);
  // Sharing should default to viewer mode; do not force edit UI for recipients.
  params.delete(EDIT_PARAM);

  // Re-encode the current formula so the share URL is canonical and can use
  // `formulab64` when supported, even if the current URL hasn't upgraded yet.
  await writeFormulaToSearchParams(params, formulaTextarea?.value || '');

  // Finger constants can change while URL updates are suppressed (e.g. during
  // animations). Build the share URL from the latest in-memory finger values
  // rather than relying on `window.location.search`.
  const fingerLabels = activeFingerState?.allSlots?.length ? activeFingerState.allSlots : [];

  // Prune stale finger values + animations from the share URL so recipients
  // can't accidentally inherit animations for fingers that are not in the formula.
  pruneFingerUrlParams(params, {
    knownLabels: Array.from(knownFingerLabels),
    activeLabels: fingerLabels,
    animationSuffix: ANIMATION_SUFFIX,
    animationTimeParam: ANIMATION_TIME_PARAM,
  });

  // Keep solo selection in the share URL, but prune it to active labels.
  // This makes it possible to share links like "solo only W1,W2".
  const activeSet = new Set((fingerLabels || []).filter((label) => isFingerLabel(label)));
  const solos = new Set(Array.from(soloLabelSet || []).filter((label) => activeSet.has(label)));
  const solosSerialized = serializeSolosParam(solos);
  if (solosSerialized) {
    params.set(SOLOS_PARAM, solosSerialized);
  } else {
    params.delete(SOLOS_PARAM);
  }

  for (const label of fingerLabels) {
    if (!isFingerLabel(label)) {
      continue;
    }
    ensureFingerState(label);
    const latest = latestOffsets[label] ?? reflexCore?.getFingerValue(label) ?? defaultFingerOffset(label);
    const serialized = formatComplexForQuery(latest.x, latest.y);
    if (serialized) {
      params.set(label, serialized);
    } else {
      params.delete(label);
    }
  }

  url.search = params.toString();
  return url.toString();
}

async function copyTextToClipboard(text) {
  if (!text) {
    throw new Error('Nothing to copy');
  }
  const clipboard = navigator?.clipboard;
  if (clipboard && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(text);
      return;
    } catch (error) {
      // Fall through to the execCommand-based fallback (e.g. insecure contexts).
      console.warn('navigator.clipboard.writeText failed; falling back.', error);
    }
  }

  // Fallback for older browsers / insecure contexts.
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  textarea.style.left = '-1000px';
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  const ok = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
  document.body.removeChild(textarea);
  if (!ok) {
    throw new Error('Clipboard copy fallback failed');
  }
}

function showTransientStatus(message, { timeoutMs = 1400 } = {}) {
  if (!versionPill) {
    return;
  }
  const baseline = `v${APP_VERSION}`;
  versionPill.textContent = message;
  window.setTimeout(() => {
    if (versionPill.textContent === message) {
      versionPill.textContent = baseline;
    }
  }, timeoutMs);
}

async function copyShareLinkToClipboard() {
  const shareUrl = await buildShareUrl();
  try {
    await copyTextToClipboard(shareUrl);
    showTransientStatus('Copied link');
  } catch (error) {
    console.warn('Clipboard write failed; falling back to prompt.', error);
    window.prompt('Copy this Reflex4You link:', shareUrl);
  }
}

function buildAnimationTracksFromQuery() {
  const tracks = new Map();
  const candidates = activeFingerState?.allSlots || [];
  for (const label of candidates) {
    const interval = readAnimationIntervalFromQuery(label);
    if (interval) {
      tracks.set(label, interval);
    }
  }
  return tracks;
}

function recomputeGlobalTrackLabelSets(tracksFromQuery) {
  const all = new Set(Array.from(tracksFromQuery.keys()));
  globalAllTrackLabelSet = all;
  const effective = new Set(Array.from(all).filter((label) => !globalMutedLabelSet.has(label)));
  globalEffectiveTrackLabelSet = effective;
}

function buildEffectiveGlobalTracksFromQuery() {
  const all = buildAnimationTracksFromQuery();
  recomputeGlobalTrackLabelSets(all);
  const effective = new Map();
  for (const [label, interval] of all.entries()) {
    if (!globalMutedLabelSet.has(label)) {
      effective.set(label, interval);
    }
  }
  return { all, effective };
}

function applyAnimationStartValues(tracks) {
  if (!reflexCore) {
    return;
  }
  suppressFingerQueryUpdates = true;
  try {
    for (const [label, interval] of tracks.entries()) {
      if (interval?.start) {
        reflexCore.setFingerValue(label, interval.start.x, interval.start.y, { triggerRender: false });
      }
    }
  } finally {
    suppressFingerQueryUpdates = false;
  }
  reflexCore.render();
}

function lerpComplex(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function startAnimations(tracks) {
  if (!reflexCore) {
    return;
  }
  if (animationController) {
    animationController.stop();
  }
  // Starting global playback implies "these tracks are active".
  globalAllTrackLabelSet = new Set(Array.from(tracks.keys()));
  globalEffectiveTrackLabelSet = new Set(Array.from(tracks.keys()));
  animationController = createAnimationController(reflexCore, tracks, animationSeconds);
  animationController.start();
  applySoloFilterToRenderer();
}

function createAnimationController(core, tracks, secondsPerSegment, options = {}) {
  const startPaused = Boolean(options.startPaused);
  const state = {
    core,
    tracks: new Map(tracks),
    secondsPerSegment: Math.max(0.001, Number(secondsPerSegment) || DEFAULT_ANIMATION_SECONDS),
    rafId: null,
    playing: startPaused,
    paused: startPaused,
    lastNowMs: 0,
    perTrack: new Map(),
  };

  for (const [label, interval] of state.tracks.entries()) {
    state.perTrack.set(label, {
      label,
      interval,
      baseStartMs: 0,
      initialized: false,
    });
  }

  function stepTrack(track, nowMs) {
    const durationMs = state.secondsPerSegment * 1000;
    if (!track.initialized) {
      track.baseStartMs = nowMs;
      track.initialized = true;
    }
    const interval = track.interval;
    if (!interval) {
      return null;
    }
    const start = interval.start;
    const end = interval.end;
    const elapsed = nowMs - track.baseStartMs;
    const t = durationMs > 0 ? elapsed / durationMs : 0;
    const frac = t - Math.floor(t);
    return { value: lerpComplex(start, end, Math.max(0, Math.min(1, frac))), done: false };
  }

  function frame(nowMs) {
    if (!state.playing || state.paused) {
      return;
    }
    state.lastNowMs = nowMs;
    suppressFingerQueryUpdates = true;
    try {
      for (const track of state.perTrack.values()) {
        const step = stepTrack(track, nowMs);
        if (!step?.value) {
          continue;
        }
        state.core.setFingerValue(track.label, step.value.x, step.value.y, { triggerRender: false });
      }
      state.core.render();
    } finally {
      suppressFingerQueryUpdates = false;
    }
    state.rafId = window.requestAnimationFrame(frame);
  }

  return {
    start() {
      if (state.playing && !state.paused) {
        return;
      }
      state.playing = true;
      state.paused = false;
      state.rafId = window.requestAnimationFrame(frame);
    },
    pause() {
      state.paused = true;
      if (state.rafId != null) {
        window.cancelAnimationFrame(state.rafId);
        state.rafId = null;
      }
    },
    stop() {
      state.playing = false;
      state.paused = false;
      if (state.rafId != null) {
        window.cancelAnimationFrame(state.rafId);
        state.rafId = null;
      }
    },
    isPlaying() {
      return state.playing && !state.paused;
    },
    isPaused() {
      return state.playing && state.paused;
    },
  };
}

function buildPreviewTracksFromState() {
  const tracks = new Map();
  for (const label of Array.from(previewLabelSet || [])) {
    const interval = readAnimationIntervalFromQuery(label);
    if (interval) {
      tracks.set(label, interval);
    }
  }
  return tracks;
}

function stopPreviewAnimations() {
  if (previewController) {
    previewController.stop();
  }
  previewController = null;
  previewLabelSet = new Set();
  applySoloFilterToRenderer();
  refreshFingerSoloValueDisplays();
  updateFingerSoloButtonText();
}

function setPreviewLabelPlaying(label, shouldPlay) {
  if (!isFingerLabel(label)) {
    return;
  }
  const interval = readAnimationIntervalFromQuery(label);
  if (!interval) {
    return;
  }
  const next = new Set(previewLabelSet);
  if (shouldPlay) {
    next.add(label);
  } else {
    next.delete(label);
  }
  previewLabelSet = next;

  if (previewController) {
    previewController.stop();
    previewController = null;
  }
  const tracks = buildPreviewTracksFromState();
  if (tracks.size && reflexCore) {
    previewController = createAnimationController(reflexCore, tracks, animationSeconds);
    previewController.start();
  }
  applySoloFilterToRenderer();
  refreshFingerSoloValueDisplays();
  updateFingerSoloButtonText();
}

function setGlobalLabelMuted(label, muted) {
  if (!isFingerLabel(label)) {
    return;
  }
  const next = new Set(globalMutedLabelSet);
  if (muted) {
    next.add(label);
  } else {
    next.delete(label);
  }
  globalMutedLabelSet = next;

  const wasPlaying = Boolean(animationController?.isPlaying?.());
  const wasPaused = Boolean(animationController?.isPaused?.());

  if (animationController) {
    animationController.stop();
    animationController = null;
  }

  const { effective } = buildEffectiveGlobalTracksFromQuery();
  if (effective.size && reflexCore) {
    // If the user explicitly pressed ▶ on a parameter, they expect it to animate
    // even if the global controller had previously been stopped (e.g. when all
    // labels were muted). So when unmuting, always start playback.
    const shouldStart = !muted || wasPlaying;
    animationController = createAnimationController(reflexCore, effective, animationSeconds, { startPaused: !shouldStart && wasPaused });
    if (shouldStart) {
      animationController.start();
    }
  }

  applySoloFilterToRenderer();
  refreshFingerSoloValueDisplays();
  updateFingerSoloButtonText();
}

function toggleGlobalAnimationPlayback() {
  const anyIntervals = buildAnimationTracksFromQuery();
  recomputeGlobalTrackLabelSets(anyIntervals);

  if (!reflexCore) {
    return;
  }

  // If no controller exists, create one (honor muted labels).
  if (!animationController) {
    const { effective } = buildEffectiveGlobalTracksFromQuery();
    if (!effective.size) {
      return;
    }
    animationController = createAnimationController(reflexCore, effective, animationSeconds);
    animationController.start();
    applySoloFilterToRenderer();
    refreshFingerSoloValueDisplays();
    updateFingerSoloButtonText();
    return;
  }

  if (animationController.isPlaying()) {
    animationController.pause();
  } else {
    animationController.start();
  }
  applySoloFilterToRenderer();
  refreshFingerSoloValueDisplays();
  updateFingerSoloButtonText();
}

function setAnimationStartFromCurrent() {
  if (!reflexCore) {
    return;
  }
  const snapshot = {};
  for (const label of activeFingerState.allSlots) {
    snapshot[label] = reflexCore.getFingerValue(label);
  }
  animationDraftStart = snapshot;
  alert('Animation start recorded for active handles.');
}

function setAnimationEndFromCurrent() {
  if (!reflexCore) {
    return;
  }
  if (!animationDraftStart) {
    alert('Set animation start first.');
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const affected = [];
  for (const label of activeFingerState.allSlots) {
    const start = animationDraftStart[label];
    if (!start) {
      continue;
    }
    const end = reflexCore.getFingerValue(label);
    const key = `${label}${ANIMATION_SUFFIX}`;
    const serialized = serializeAnimationInterval({
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
    });
    if (serialized) {
      params.set(key, serialized);
      affected.push(label);
    } else {
      params.delete(key);
    }
  }
  replaceUrlSearch(params);
  animationDraftStart = null;

  const tracks = buildAnimationTracksFromQuery();
  if (tracks.size) {
    applyAnimationStartValues(tracks);
    if (!isEditModeActive()) {
      startAnimations(tracks);
    }
  }
  alert(affected.length ? `Animation interval set for: ${affected.join(', ')}` : 'No active handles to animate.');
}

function promptAndSetAnimationTime() {
  const current = formatSecondsForQuery(animationSeconds) || `${DEFAULT_ANIMATION_SECONDS}s`;
  const raw = window.prompt('Set animation time (seconds, suffix "s" optional):', current);
  if (raw === null) {
    return;
  }
  const parsed = parseSecondsFromQuery(raw);
  if (!parsed) {
    alert('Could not parse animation time. Example: "5s" or "10".');
    return;
  }
  animationSeconds = parsed;
  updateSearchParam(ANIMATION_TIME_PARAM, formatSecondsForQuery(parsed));
  const tracks = buildAnimationTracksFromQuery();
  if (tracks.size && !isEditModeActive()) {
    startAnimations(tracks);
  }
  // Keep per-parameter preview playback in sync with the new duration.
  if (previewController) {
    previewController.stop();
    previewController = null;
  }
  const previewTracks = buildPreviewTracksFromState();
  if (previewTracks.size && reflexCore) {
    previewController = createAnimationController(reflexCore, previewTracks, animationSeconds);
    previewController.start();
  }

  // If global controller exists (playing or paused), restart it to apply new duration.
  if (animationController) {
    const wasPlaying = Boolean(animationController.isPlaying());
    const wasPaused = Boolean(animationController.isPaused());
    animationController.stop();
    animationController = null;
    const { effective } = buildEffectiveGlobalTracksFromQuery();
    if (effective.size && reflexCore) {
      animationController = createAnimationController(reflexCore, effective, animationSeconds, { startPaused: wasPaused });
      if (wasPlaying) {
        animationController.start();
      }
    }
    applySoloFilterToRenderer();
  }
}

function confirmAndReset() {
  if (
    !window.confirm(
      'Reset the current formula and finger positions?',
    )
  ) {
    return;
  }
  resetApplicationState();
}

function resetApplicationState() {
  formulaTextarea.value = DEFAULT_FORMULA_TEXT;
  applyFormulaFromTextarea({ updateQuery: false });
  updateFormulaQueryParam(null).catch((error) =>
    console.warn('Failed to clear formula parameter.', error),
  );
  clearPersistedLastSearch();
  resetFingerValuesToDefaults();
  clearError();
  // Reset is a fresh start: clear undo/redo stacks and seed with the new state.
  historyPast.length = 0;
  historyFuture.length = 0;
  commitHistorySnapshot({ force: true });
}

function resetFingerValuesToDefaults() {
  if (!reflexCore) {
    return;
  }
  Array.from(knownFingerLabels).forEach((label) => {
    const defaults = defaultFingerOffset(label);
    reflexCore.setFingerValue(label, defaults.x, defaults.y);
  });
}

async function saveCanvasImage() {
  if (!canvas) {
    return;
  }
  if (!reflexCore) {
    alert('Unable to save image because the renderer is unavailable.');
    return;
  }

  function clampExportPx(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return null;
    return Math.max(1, Math.min(20000, n));
  }

  function screenExportPresets() {
    if (typeof window === 'undefined') return [];
    const viewport = window.visualViewport;
    const cssW = Number(viewport?.width ?? window.innerWidth);
    const cssH = Number(viewport?.height ?? window.innerHeight);
    const dpr = Number(window.devicePixelRatio) || 1;
    if (!Number.isFinite(cssW) || !Number.isFinite(cssH) || cssW <= 0 || cssH <= 0) {
      return [];
    }
    const screenW = clampExportPx(cssW * dpr);
    const screenH = clampExportPx(cssH * dpr);
    if (!screenW || !screenH) return [];
    return [
      {
        key: 'screen',
        label: `Screen (${screenW}×${screenH} px)`,
        width: screenW,
        height: screenH,
      },
    ];
  }

  const defaultSize = canvas.width && canvas.height ? { width: canvas.width, height: canvas.height } : null;
  const presets = [
    ...(defaultSize
      ? [
        {
          key: 'current',
          label: `Current (${defaultSize.width}×${defaultSize.height} px)`,
          width: defaultSize.width,
          height: defaultSize.height,
        },
      ]
      : []),
    ...screenExportPresets(),
    ...defaultImageExportPresets(),
  ];

  const requested = await promptImageExportSize({
    title: 'Export image (PNG)',
    presets,
    defaultSize: defaultSize || undefined,
    defaultPresetKey: 'screen',
    includeSupersampleOption: {
      label: 'Supersampling (antialiasing)',
      scales: [1, 2, 3, 4],
      defaultScale: 4,
    },
    includeFormulaOverlayOption: {
      label: 'Overlay formula on bottom half (with translucent white background)',
        defaultChecked: true,
    },
  });
  if (!requested) {
    return;
  }

  // We may clamp the requested supersampling scale below; show the effective value.
  const requestedScale =
    requested && (requested.renderScale === 4 || requested.renderScale === 3 || requested.renderScale === 2)
      ? requested.renderScale
      : 1;

  const activeLabels = new Set([
    ...Array.from(knownFingerLabels),
    ...(activeFingerState?.allSlots || []),
    'W1',
    'W2',
  ]);

  async function ensureMathJaxLoadedForExport() {
    const win = typeof window !== 'undefined' ? window : null;
    if (!win) return false;
    try {
      if (win.MathJax?.startup?.promise) {
        await win.MathJax.startup.promise;
        return true;
      }
      if (typeof win.MathJax?.tex2svg === 'function') {
        return true;
      }
    } catch (_) {
      // ignore; renderer will fall back to plain text
    }

    // Install MathJax if not present (matches formula.html).
    try {
      if (!win.MathJax) {
        win.MathJax = {
          startup: { typeset: false },
          tex: { inlineMath: [['$', '$'], ['\\(', '\\)']] },
          svg: { fontCache: 'none' },
        };
      }
      const existing = document.querySelector?.('script[data-mathjax="tex-svg"]');
      if (existing) {
        // Wait for any in-flight load.
        await new Promise((resolve) => setTimeout(resolve, 0));
      } else {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';
        script.async = true;
        script.defer = true;
        script.dataset.mathjax = 'tex-svg';
        const loaded = new Promise((resolve, reject) => {
          script.onload = () => resolve(true);
          script.onerror = (e) => reject(e);
        });
        (document.head || document.body).appendChild(script);
        await loaded;
      }
      if (win.MathJax?.startup?.promise) {
        await win.MathJax.startup.promise;
      }
      return typeof win.MathJax?.tex2svg === 'function';
    } catch (e) {
      console.warn('Failed to load MathJax for export; falling back.', e);
      return false;
    }
  }

  const outputWidth = requested.width;
  const outputHeight = requested.height;
  let renderScale =
    requested && (requested.renderScale === 4 || requested.renderScale === 3 || requested.renderScale === 2)
      ? requested.renderScale
      : 1;
  // Keep within export limits; if requested scale is too large, fall back to the largest allowed scale.
  if (!Number.isFinite(outputWidth) || !Number.isFinite(outputHeight) || outputWidth <= 0 || outputHeight <= 0) {
    renderScale = 1;
  } else {
    const maxW = Math.floor(20000 / outputWidth);
    const maxH = Math.floor(20000 / outputHeight);
    const maxScale = Math.max(1, Math.min(maxW, maxH));
    if (renderScale > maxScale) {
      renderScale = maxScale >= 4 ? 4 : maxScale >= 3 ? 3 : maxScale >= 2 ? 2 : 1;
    }
  }

  const clamped = requestedScale !== renderScale;
  const status = renderScale > 1 ? `Rendering (SS ${renderScale}×)…` : 'Rendering…';
  showTransientStatus(clamped ? `${status.replace(')…', `, clamped)…`)}` : status, { timeoutMs: 4000 });

  const renderWidth = outputWidth * renderScale;
  const renderHeight = outputHeight * renderScale;

  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = renderWidth;
  renderCanvas.height = renderHeight;
  renderCanvas.style.position = 'fixed';
  renderCanvas.style.left = '-10000px';
  renderCanvas.style.top = '-10000px';
  renderCanvas.style.width = `${renderWidth}px`;
  renderCanvas.style.height = `${renderHeight}px`;
  renderCanvas.style.pointerEvents = 'none';
  document.body.appendChild(renderCanvas);

  let blob = null;
  const includeFormulaOverlay = Boolean(requested.includeFormulaOverlay);
  const fingerValues = {};
  for (const label of activeLabels) {
    if (!isFingerLabel(label)) continue;
    const v = reflexCore.getFingerValue(label);
    fingerValues[label] = { x: v.x, y: v.y };
  }

  const exportCore = new ReflexCore(renderCanvas, reflexCore.getFormulaAST(), {
    autoRender: false,
    installEventListeners: false,
  });

  function computeNonTransparentBounds(canvasEl) {
    const ctx = canvasEl?.getContext?.('2d');
    if (!ctx) return null;
    const w = canvasEl.width || 0;
    const h = canvasEl.height || 0;
    if (w <= 0 || h <= 0) return null;
    let data;
    try {
      data = ctx.getImageData(0, 0, w, h).data;
    } catch (_) {
      return null;
    }
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    // Scan alpha channel only.
    for (let y = 0; y < h; y += 1) {
      const row = y * w * 4;
      for (let x = 0; x < w; x += 1) {
        const a = data[row + x * 4 + 3];
        if (a > 0) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) {
      return null;
    }
    return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }

  try {
    // Match the current finger state.
    for (const label of activeLabels) {
      if (!isFingerLabel(label)) continue;
      const v = reflexCore.getFingerValue(label);
      exportCore.setFingerValue(label, v.x, v.y, { triggerRender: false });
    }

    exportCore.renderToPixelSize(renderWidth, renderHeight);
    if (exportCore.gl && typeof exportCore.gl.finish === 'function') {
      exportCore.gl.finish();
    }

    if (!includeFormulaOverlay && renderScale === 1) {
      blob = await canvasToPngBlob(renderCanvas);
    } else {
      // Composite to a 2D canvas so we can downscale (HD AA) and/or draw a formula overlay.
      const composite = document.createElement('canvas');
      composite.width = outputWidth;
      composite.height = outputHeight;
      const ctx = composite.getContext('2d');
      if (!ctx) {
        blob = await canvasToPngBlob(renderCanvas);
      } else {
        try {
          ctx.imageSmoothingEnabled = true;
          if (typeof ctx.imageSmoothingQuality === 'string') {
            ctx.imageSmoothingQuality = 'high';
          }
        } catch (_) {
          // ignore
        }
        ctx.drawImage(renderCanvas, 0, 0, outputWidth, outputHeight);

        if (includeFormulaOverlay) {
          // Render formula to an offscreen canvas and draw it near the bottom
          // with margins; only the formula's own padded background is translucent.
          await ensureMathJaxLoadedForExport();
          const latex = formulaAstToLatex(reflexCore.getFormulaAST(), {
            inlineFingerConstants: true,
            fingerValues,
          });
          const marginX = Math.max(16, Math.round(outputWidth * 0.03));
          const marginBottom = Math.max(16, Math.round(outputHeight * 0.03));
          const pad = Math.max(14, Math.round(Math.min(outputWidth, outputHeight) * 0.02));

          const formulaW = Math.max(1, outputWidth - marginX * 2);
          // Keep scanning manageable for big exports while still giving the formula room.
          const formulaH = Math.max(1, Math.min(Math.round(outputHeight * 0.28), 900));

          const formulaCanvas = document.createElement('canvas');
          formulaCanvas.width = formulaW;
          formulaCanvas.height = formulaH;
          await renderLatexToCanvas(latex, formulaCanvas, {
            backgroundHex: '00000000', // transparent; background already drawn on composite
            dpr: 1, // exact pixels for export
            drawInsetBackground: false,
          });

          const bounds = computeNonTransparentBounds(formulaCanvas);
          const drawX = marginX;
          const drawY = Math.max(0, outputHeight - marginBottom - formulaH);

          if (bounds) {
            const rectX = Math.max(0, drawX + bounds.minX - pad);
            const rectY = Math.max(0, drawY + bounds.minY - pad);
            const rectW = Math.min(outputWidth - rectX, bounds.width + pad * 2);
            const rectH = Math.min(outputHeight - rectY, bounds.height + pad * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillRect(rectX, rectY, rectW, rectH);
          } else {
            // If we can't detect bounds (e.g. CORS/taint), fall back to a conservative box.
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillRect(drawX, drawY, formulaW, formulaH);
          }

          ctx.drawImage(formulaCanvas, drawX, drawY, formulaW, formulaH);
        }

        blob = await canvasToPngBlob(composite);
      }
    }
  } finally {
    exportCore.dispose?.();
    try {
      renderCanvas.remove();
    } catch (_) {
      // ignore
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ssTag = renderScale > 1 ? `-ss${renderScale}x-r${renderWidth}x${renderHeight}` : '';
  const filename = `reflex4you-${requested.width}x${requested.height}${ssTag}-${stamp}.png`;
  if (blob) {
    downloadBlob(blob, filename);
  }
}

async function ensureCanvasSnapshotReady() {
  if (reflexCore) {
    reflexCore.render();
    if (reflexCore.gl && typeof reflexCore.gl.finish === 'function') {
      reflexCore.gl.finish();
    }
  }
  await waitForNextFrame();
}

function waitForNextFrame() {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    return Promise.resolve();
  }
  return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

function saveCanvasImageFallback(filename) {
  if (!canvas) {
    return;
  }
  try {
    const dataUrl = canvas.toDataURL('image/png');
    triggerImageDownload(dataUrl, filename, false);
  } catch (err) {
    alert(`Unable to save image: ${err.message}`);
  }
}

function triggerImageDownload(url, filename, shouldRevoke) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  if (shouldRevoke) {
    URL.revokeObjectURL(url);
  }
}

if ('serviceWorker' in navigator) {
  // Version the SW script URL so updates can't get stuck behind a cached SW script.
  const SW_URL = './service-worker.js?sw=25.0';
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SW_URL).then((registration) => {
      // Auto-activate updated workers so cache/version bumps take effect quickly.
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      registration?.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            // New content is available; activate it immediately.
            installing.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    }).catch((error) => {
      console.warn('Reflex4You service worker registration failed.', error);
    });
  });
}
