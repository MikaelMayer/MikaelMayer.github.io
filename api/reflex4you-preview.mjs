import { gunzipSync } from 'node:zlib';
import { parseFormulaInput } from '../apps/reflex4you/arithmetic-parser.mjs';
import { formatCaretIndicator, getCaretSelection } from '../apps/reflex4you/parse-error-format.mjs';
import { formulaAstToLatex } from '../apps/reflex4you/formula-renderer.mjs';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';

const FINGER_LABEL_REGEX = /^(?:[FD]\d+|W[012])$/;
const ROTATION_LABEL_REGEX = /^(?:RA|RB)$/;
const ALLOWED_LABEL_REGEX = /^(?:[FD]\d+|W[012]|RA|RB)$/;

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const tex = new TeX({ packages: ['base', 'ams'] });
const svg = new SVG({ fontCache: 'none' });
const mathJaxDoc = mathjax.document('', { InputJax: tex, OutputJax: svg });

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
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

function parseBooleanInput(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

function readQueryBody(req) {
  const url = new URL(req.url || '', 'http://localhost');
  const params = url.searchParams;
  const body = {};
  if (params.has('source')) body.source = params.get('source');
  if (params.has('formula')) body.formula = params.get('formula');
  if (params.has('formulab64')) body.formulab64 = params.get('formulab64');
  if (params.has('formula64')) body.formula64 = params.get('formula64');
  if (params.has('values')) {
    const raw = params.get('values');
    if (raw) {
      body.values = raw;
      body.__valuesFromQuery = true;
    }
  }
  if (params.has('inlineFingerConstants')) {
    body.inlineFingerConstants = parseBooleanInput(params.get('inlineFingerConstants'), null);
  }
  if (params.has('compactComplexNumbers')) {
    body.compactComplexNumbers = parseBooleanInput(params.get('compactComplexNumbers'), null);
  }
  if (params.has('decimalPlaces')) {
    body.decimalPlaces = Number(params.get('decimalPlaces'));
  }
  if (params.has('decimalSeparator')) {
    body.decimalSeparator = params.get('decimalSeparator');
  }
  if (params.has('format')) {
    body.format = params.get('format');
  }
  return body;
}

function isFingerLabel(label) {
  return FINGER_LABEL_REGEX.test(label);
}

function isRotationLabel(label) {
  return ROTATION_LABEL_REGEX.test(label);
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

function normalizeFingerValues(input, errors) {
  const fingerValues = {};
  if (!input || typeof input !== 'object') {
    return fingerValues;
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
    if (isFingerLabel(label) || isRotationLabel(label)) {
      fingerValues[label] = { re: parsed.re, im: parsed.im };
    }
  }
  return fingerValues;
}

function decodeBase64Url(encoded) {
  const normalized = String(encoded || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, 'base64');
}

function decodeFormulaFromBase64Url(encoded) {
  const buffer = decodeBase64Url(encoded);
  return gunzipSync(buffer).toString('utf8');
}

function resolveFormulaSource(body, errors) {
  const raw = body?.source ?? body?.formula ?? null;
  if (raw != null && String(raw).trim()) {
    return String(raw);
  }
  const encoded = body?.formulab64 ?? body?.formula64 ?? null;
  if (encoded != null && String(encoded).trim()) {
    try {
      return decodeFormulaFromBase64Url(encoded);
    } catch (error) {
      errors.push('Invalid formulab64/formula64 value.');
      return null;
    }
  }
  return null;
}

function renderLatexToSvg(latex) {
  const node = mathJaxDoc.convert(String(latex || ''), { display: true });
  return adaptor.outerHTML(node);
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    jsonResponse(res, 405, { ok: false, error: 'GET or POST only' });
    return;
  }

  let body = {};
  if (req.method === 'GET') {
    body = readQueryBody(req);
  } else {
    try {
      body = await readJsonBody(req);
    } catch (error) {
      jsonResponse(res, 400, { ok: false, error: 'Invalid JSON body' });
      return;
    }
  }

  if (body?.__valuesFromQuery && typeof body.values === 'string') {
    try {
      body.values = JSON.parse(body.values);
    } catch (error) {
      jsonResponse(res, 400, { ok: false, error: 'Invalid values JSON in query.' });
      return;
    }
  }

  const errors = [];
  const source = resolveFormulaSource(body, errors);
  if (!source || !source.trim()) {
    jsonResponse(res, 400, { ok: false, error: 'source is required', details: errors.length ? errors : null });
    return;
  }

  const valuesInput = body?.values ?? body?.fingerValues ?? null;
  const fingerValues = normalizeFingerValues(valuesInput, errors);
  if (errors.length) {
    jsonResponse(res, 400, { ok: false, error: 'Invalid request', details: errors });
    return;
  }

  const result = parseFormulaInput(source, { fingerValues });
  if (!result.ok) {
    jsonResponse(res, 200, {
      ok: false,
      svg: null,
      latex: null,
      caretMessage: formatCaretIndicator(source, result),
      caretSelection: getCaretSelection(source, result),
    });
    return;
  }

  const inlineFingerConstants = body?.inlineFingerConstants === true;
  const latexOptions = {
    inlineFingerConstants,
    fingerValues,
  };
  if (body?.compactComplexNumbers === false) {
    latexOptions.compactComplexNumbers = false;
  }
  if (Number.isFinite(body?.decimalPlaces)) {
    latexOptions.decimalPlaces = Number(body.decimalPlaces);
  }
  if (typeof body?.decimalSeparator === 'string' && body.decimalSeparator) {
    latexOptions.decimalSeparator = body.decimalSeparator;
  }

  let latex;
  let svgText;
  try {
    latex = formulaAstToLatex(result.value, latexOptions);
    svgText = renderLatexToSvg(latex);
  } catch (error) {
    const message = error?.message ? String(error.message) : String(error || 'Preview render error');
    jsonResponse(res, 500, { ok: false, error: message });
    return;
  }

  const wantsJson =
    String(body?.format || '').toLowerCase() === 'json' ||
    String(req.headers?.accept || '').includes('application/json');

  if (wantsJson) {
    jsonResponse(res, 200, {
      ok: true,
      svg: svgText,
      latex,
      caretMessage: null,
      caretSelection: null,
    });
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.end(svgText);
}
