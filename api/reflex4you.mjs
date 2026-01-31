import { gzipSync } from 'node:zlib';
import { parseFormulaInput } from '../apps/reflex4you/arithmetic-parser.mjs';
import { formatCaretIndicator, getCaretSelection } from '../apps/reflex4you/parse-error-format.mjs';
import { compileFormulaForGpu, FINGER_DECIMAL_PLACES } from '../apps/reflex4you/core-engine.mjs';

const DEFAULT_BASE_URL = 'https://mikaelmayer.github.io/apps/reflex4you/index.html';
const DECIMAL_PLACES = Number.isFinite(FINGER_DECIMAL_PLACES) ? FINGER_DECIMAL_PLACES : 4;
const FINGER_LABEL_REGEX = /^(?:[FD]\d+|W[012])$/;
const ROTATION_LABEL_REGEX = /^(?:RA|RB)$/;
const ALLOWED_LABEL_REGEX = /^(?:[FD]\d+|W[012]|RA|RB)$/;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function jsonResponse(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (!chunks.length) {
    return {};
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) {
    return {};
  }
  return JSON.parse(text);
}

function isFingerLabel(label) {
  return FINGER_LABEL_REGEX.test(label);
}

function isRotationLabel(label) {
  return ROTATION_LABEL_REGEX.test(label);
}

function isSoloLabel(label) {
  return isFingerLabel(label) || isRotationLabel(label);
}

function parseComplexString(raw) {
  if (raw == null) return null;
  const normalized = String(raw).trim().replace(/\s+/g, '');
  if (!normalized) return null;

  if (normalized.includes(',')) {
    const parts = normalized.split(',');
    if (parts.length !== 2) return null;
    const re = Number(parts[0]);
    const im = Number(parts[1]);
    if (!Number.isFinite(re) || !Number.isFinite(im)) return null;
    return { re, im };
  }

  if (normalized.endsWith('i')) {
    const core = normalized.slice(0, -1);
    if (core === '' || core === '+') return { re: 0, im: 1 };
    if (core === '-') return { re: 0, im: -1 };
    const splitIdx = findRealImagSplit(core);
    if (splitIdx > 0) {
      const realPart = core.slice(0, splitIdx);
      const imagPart = core.slice(splitIdx);
      const re = Number(realPart);
      const im = Number(imagPart);
      if (!Number.isFinite(re) || !Number.isFinite(im)) return null;
      return { re, im };
    }
    const im = Number(core);
    if (!Number.isFinite(im)) return null;
    return { re: 0, im };
  }

  const re = Number(normalized);
  if (!Number.isFinite(re)) return null;
  return { re, im: 0 };
}

function findRealImagSplit(core) {
  for (let i = core.length - 1; i > 0; i -= 1) {
    const ch = core[i];
    if (ch !== '+' && ch !== '-') continue;
    const prev = core[i - 1];
    if (prev === 'e' || prev === 'E') continue;
    return i;
  }
  return -1;
}

function parseComplexInput(value) {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    return parseComplexString(value);
  }
  if (Array.isArray(value)) {
    if (value.length < 2) return null;
    const re = Number(value[0]);
    const im = Number(value[1]);
    if (!Number.isFinite(re) || !Number.isFinite(im)) return null;
    return { re, im };
  }
  if (typeof value === 'object') {
    const re = Number(value.re ?? value.x);
    const im = Number(value.im ?? value.y);
    if (!Number.isFinite(re) || !Number.isFinite(im)) return null;
    return { re, im };
  }
  return null;
}

function parseAnimationInterval(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized || !normalized.includes('..')) return null;
    const parts = normalized.split('..');
    if (parts.length !== 2) return null;
    const start = parseComplexString(parts[0]);
    const end = parseComplexString(parts[1]);
    if (!start || !end) return null;
    return { start, end };
  }
  if (typeof value === 'object') {
    const start = parseComplexInput(value.start);
    const end = parseComplexInput(value.end);
    if (!start || !end) return null;
    return { start, end };
  }
  return null;
}

function parseDurationInput(value) {
  if (value == null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  const numeric = raw.endsWith('s') ? raw.slice(0, -1) : raw;
  const seconds = Number(numeric);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return seconds;
}

function roundToPlaces(value) {
  if (!Number.isFinite(value)) return NaN;
  const factor = 10 ** DECIMAL_PLACES;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatNumberForQuery(value) {
  const rounded = roundToPlaces(value);
  if (!Number.isFinite(rounded)) return null;
  return rounded.toFixed(DECIMAL_PLACES).replace(/\.?0+$/, '');
}

function formatComplexForQuery(re, im) {
  const real = formatNumberForQuery(re);
  const imag = formatNumberForQuery(Math.abs(im));
  if (real == null || imag == null) return null;
  const sign = im >= 0 ? '+' : '-';
  return `${real}${sign}${imag}i`;
}

function encodeFormulaToBase64Url(formula) {
  const gz = gzipSync(Buffer.from(String(formula), 'utf8'));
  return Buffer.from(gz)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function normalizeValueMap(input, errors) {
  const parseFingerValues = {};
  const queryValues = new Map();
  if (!input || typeof input !== 'object') {
    return { parseFingerValues, queryValues };
  }
  for (const rawLabel of Object.keys(input)) {
    const label = String(rawLabel || '').trim();
    if (!ALLOWED_LABEL_REGEX.test(label)) {
      errors.push(`Invalid label "${label}". Allowed: F#, D#, W0/W1/W2, RA, RB.`);
      continue;
    }
    const parsed = parseComplexInput(input[rawLabel]);
    if (!parsed) {
      errors.push(`Invalid complex value for "${label}".`);
      continue;
    }
    const formatted = formatComplexForQuery(parsed.re, parsed.im);
    if (!formatted) {
      errors.push(`Unable to format complex value for "${label}".`);
      continue;
    }
    queryValues.set(label, formatted);
    if (isFingerLabel(label)) {
      parseFingerValues[label] = { re: parsed.re, im: parsed.im };
    }
  }
  return { parseFingerValues, queryValues };
}

function normalizeAnimations(input, errors) {
  const intervals = new Map();
  if (!input || typeof input !== 'object') {
    return intervals;
  }
  for (const rawLabel of Object.keys(input)) {
    const label = String(rawLabel || '').trim();
    if (!isFingerLabel(label)) {
      errors.push(`Animations only support finger labels (F#, D#, W0/W1/W2). Found "${label}".`);
      continue;
    }
    const interval = parseAnimationInterval(input[rawLabel]);
    if (!interval) {
      errors.push(`Invalid animation interval for "${label}".`);
      continue;
    }
    intervals.set(label, interval);
  }
  return intervals;
}

function normalizeSolos(input, errors) {
  if (input == null) return null;
  let labels = [];
  if (typeof input === 'string') {
    labels = input.split(',').map((part) => String(part || '').trim()).filter(Boolean);
  } else if (Array.isArray(input)) {
    labels = input.map((part) => String(part || '').trim()).filter(Boolean);
  } else {
    errors.push('solos must be a comma-separated string or an array.');
    return null;
  }
  const invalid = labels.filter((label) => !isSoloLabel(label));
  if (invalid.length) {
    errors.push(`Invalid solos labels: ${invalid.join(', ')}`);
    return null;
  }
  return labels.join(',');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    jsonResponse(res, 405, { ok: false, error: 'POST only' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    jsonResponse(res, 400, { ok: false, error: 'Invalid JSON body' });
    return;
  }

  const source = String(body?.source ?? '');
  if (!source.trim()) {
    jsonResponse(res, 400, { ok: false, error: 'source is required' });
    return;
  }

  const baseUrl =
    typeof body?.baseUrl === 'string' && body.baseUrl.trim()
      ? body.baseUrl.trim()
      : DEFAULT_BASE_URL;
  const compress = Boolean(body?.compress);
  const includeFormulaParam = Boolean(body?.includeFormulaParam);
  const validate = body?.validate !== false;
  const compile = Boolean(body?.compile);
  const edit = Boolean(body?.edit);

  const errors = [];
  const warnings = [];

  const valuesInput = body?.values ?? body?.fingerValues ?? null;
  const { parseFingerValues, queryValues } = normalizeValueMap(valuesInput, errors);

  const animationsInput = body?.animations ?? null;
  const animationIntervals = normalizeAnimations(animationsInput, errors);

  const durationSeconds = parseDurationInput(body?.duration ?? body?.time ?? null);
  if ((body?.duration ?? body?.time) != null && durationSeconds == null) {
    errors.push('Invalid duration/time value.');
  }

  const solosParam = normalizeSolos(body?.solos ?? null, errors);

  if (errors.length) {
    jsonResponse(res, 400, { ok: false, error: 'Invalid request', details: errors });
    return;
  }

  let ast = null;
  if (validate) {
    const result = parseFormulaInput(source, { fingerValues: parseFingerValues });
    if (!result.ok) {
      jsonResponse(res, 200, {
        ok: false,
        url: null,
        caretMessage: formatCaretIndicator(source, result),
        caretSelection: getCaretSelection(source, result),
      });
      return;
    }
    ast = result.value;
  }

  if (validate && compile && ast) {
    try {
      compileFormulaForGpu(ast);
    } catch (error) {
      const message = error?.message ? String(error.message) : String(error || 'Compilation error');
      jsonResponse(res, 200, {
        ok: false,
        url: null,
        caretMessage: `Compilation error:\n${message}`,
        caretSelection: null,
      });
      return;
    }
  }

  let url;
  try {
    url = new URL(baseUrl);
  } catch (error) {
    jsonResponse(res, 400, { ok: false, error: 'Invalid baseUrl' });
    return;
  }
  url.hash = '';
  const params = new URLSearchParams(url.search);

  if (compress) {
    try {
      const encoded = encodeFormulaToBase64Url(source);
      params.set('formulab64', encoded);
      if (includeFormulaParam) {
        params.set('formula', source);
      } else {
        params.delete('formula');
      }
    } catch (error) {
      warnings.push('Compression failed; falling back to raw formula parameter.');
      params.set('formula', source);
      params.delete('formulab64');
    }
  } else {
    params.set('formula', source);
    params.delete('formulab64');
  }

  for (const [label, value] of queryValues.entries()) {
    params.set(label, value);
  }

  for (const [label, interval] of animationIntervals.entries()) {
    const start = formatComplexForQuery(interval.start.re, interval.start.im);
    const end = formatComplexForQuery(interval.end.re, interval.end.im);
    if (!start || !end) {
      jsonResponse(res, 400, { ok: false, error: `Invalid animation formatting for "${label}".` });
      return;
    }
    params.set(`${label}A`, `${start}..${end}`);
    if (!queryValues.has(label)) {
      params.set(label, start);
    }
  }

  if (durationSeconds != null) {
    params.set('t', `${durationSeconds}s`);
  }

  if (solosParam) {
    params.set('solos', solosParam);
  }

  if (edit) {
    params.set('edit', 'true');
  }

  url.search = params.toString();

  jsonResponse(res, 200, {
    ok: true,
    url: url.toString(),
    query: params.toString(),
    warnings: warnings.length ? warnings : null,
  });
}
