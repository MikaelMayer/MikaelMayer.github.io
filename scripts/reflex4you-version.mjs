#!/usr/bin/env node
/**
 * Reflex4You version sync tool.
 *
 * Single entry point to keep these in sync:
 * - apps/reflex4you/main.js          (APP_VERSION + SW URL cache buster)
 * - apps/reflex4you/service-worker.js (CACHE_MINOR)
 * - apps/reflex4you/formula-page.mjs  (SW URL cache buster)
 * - apps/reflex4you/explore-page.mjs  (SW URL cache buster)
 * - apps/reflex4you/index.html        (#app-version-pill fallback text)
 *
 * Usage:
 *   npm run reflex4you:version -- major
 *   npm run reflex4you:version -- minor
 *   npm run reflex4you:version -- set 21 --cache 21.0 --sw 21.0
 *   npm run reflex4you:version -- set 20 --cache 20.1 --sw 20.2   # revert example
 *   npm run reflex4you:version -- --dry-run major
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const APP_DIR = path.join(REPO_ROOT, 'apps', 'reflex4you');

const FILES = {
  mainJs: path.join(APP_DIR, 'main.js'),
  swJs: path.join(APP_DIR, 'service-worker.js'),
  formulaPage: path.join(APP_DIR, 'formula-page.mjs'),
  explorePage: path.join(APP_DIR, 'explore-page.mjs'),
  indexHtml: path.join(APP_DIR, 'index.html'),
};

function die(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const dryRunIdx = args.indexOf('--dry-run');
  const dryRun = dryRunIdx !== -1;
  if (dryRun) args.splice(dryRunIdx, 1);

  const help = args.includes('-h') || args.includes('--help');
  if (help || args.length === 0) {
    return { help: true, dryRun };
  }

  const action = args[0];
  const rest = args.slice(1);

  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--app') flags.app = rest[++i];
    else if (a === '--cache') flags.cache = rest[++i];
    else if (a === '--sw') flags.sw = rest[++i];
    else if (flags._) flags._.push(a);
    else flags._ = [a];
  }
  return { help: false, dryRun, action, flags };
}

function parseIntStrict(value, label) {
  if (value == null) die(`Missing ${label}.`);
  const n = Number(String(value).trim());
  if (!Number.isInteger(n) || n < 0) die(`Invalid ${label}: ${value}`);
  return n;
}

function parseMajorMinor(value, label) {
  if (value == null) die(`Missing ${label}.`);
  const raw = String(value).trim();
  const m = /^(\d+)\.(\d+)$/.exec(raw);
  if (!m) die(`Invalid ${label} (expected M.m): ${value}`);
  return { major: Number(m[1]), minor: Number(m[2]), raw };
}

function replaceOnce(text, regex, replacement, labelForError) {
  if (!regex.test(text)) {
    die(`Failed to update ${labelForError} (pattern not found).`);
  }
  return text.replace(regex, replacement);
}

function computeNext({ action, flags, current }) {
  if (action === 'major') {
    const nextApp = current.appMajor + 1;
    const nextCache = { major: nextApp, minor: 0, raw: `${nextApp}.0` };
    const nextSw = { major: nextApp, minor: 0, raw: `${nextApp}.0` };
    return { appMajor: nextApp, cache: nextCache, sw: nextSw };
  }

  if (action === 'minor') {
    const major = current.appMajor;
    const nextMinor = Math.max(current.cache.minor, current.sw.minor) + 1;
    const next = { major, minor: nextMinor, raw: `${major}.${nextMinor}` };
    return { appMajor: major, cache: next, sw: next };
  }

  if (action === 'set') {
    const positional = flags._ || [];
    const app = flags.app ?? positional[0];
    const appMajor = parseIntStrict(app, 'app major version');

    const cache = flags.cache ? parseMajorMinor(flags.cache, '--cache') : { major: appMajor, minor: 0, raw: `${appMajor}.0` };
    const sw = flags.sw ? parseMajorMinor(flags.sw, '--sw') : { major: appMajor, minor: 0, raw: `${appMajor}.0` };

    if (cache.major !== appMajor) die(`--cache major (${cache.major}) must match app major (${appMajor}).`);
    if (sw.major !== appMajor) die(`--sw major (${sw.major}) must match app major (${appMajor}).`);
    return { appMajor, cache, sw };
  }

  die(`Unknown action: ${action}\nExpected: major | minor | set`);
}

function printHelp() {
  console.log(
    [
      'Reflex4You version sync tool',
      '',
      'Usage:',
      '  npm run reflex4you:version -- major',
      '  npm run reflex4you:version -- minor',
      '  npm run reflex4you:version -- set 21 --cache 21.0 --sw 21.0',
      '  npm run reflex4you:version -- set 20 --cache 20.1 --sw 20.2   # revert example',
      '  npm run reflex4you:version -- --dry-run major',
      '',
      'What it updates:',
      '  - apps/reflex4you/main.js: APP_VERSION + service-worker.js?sw=…',
      "  - apps/reflex4you/service-worker.js: CACHE_MINOR = 'M.m'",
      '  - apps/reflex4you/formula-page.mjs: service-worker.js?sw=…',
      '  - apps/reflex4you/explore-page.mjs: service-worker.js?sw=…',
      '  - apps/reflex4you/index.html: #app-version-pill fallback vM',
      '',
      'Actions:',
      '  - major: APP_VERSION++, set cache+sw to (M.0)',
      '  - minor: keep APP_VERSION, bump cache+sw to next minor (M.(max+1))',
      '  - set: explicitly set versions (useful for reverts)',
    ].join('\n'),
  );
}

async function main() {
  const parsed = parseArgs(process.argv);
  if (parsed.help) {
    printHelp();
    return;
  }

  const [mainJs, swJs, formulaPage, explorePage, indexHtml] = await Promise.all([
    fs.readFile(FILES.mainJs, 'utf8'),
    fs.readFile(FILES.swJs, 'utf8'),
    fs.readFile(FILES.formulaPage, 'utf8'),
    fs.readFile(FILES.explorePage, 'utf8'),
    fs.readFile(FILES.indexHtml, 'utf8'),
  ]);

  const appMatch = /const\s+APP_VERSION\s*=\s*(\d+)\s*;/.exec(mainJs);
  if (!appMatch) die('Could not find APP_VERSION in apps/reflex4you/main.js');
  const appMajor = Number(appMatch[1]);

  const cacheMatch = /const\s+CACHE_MINOR\s*=\s*'(\d+\.\d+)'\s*;/.exec(swJs);
  if (!cacheMatch) die("Could not find CACHE_MINOR = 'M.m' in apps/reflex4you/service-worker.js");
  const cache = parseMajorMinor(cacheMatch[1], 'CACHE_MINOR');

  const swMatch = /service-worker\.js\?sw=(\d+\.\d+)/.exec(mainJs);
  if (!swMatch) die('Could not find service-worker.js?sw=… in apps/reflex4you/main.js');
  const sw = parseMajorMinor(swMatch[1], 'SW_URL');

  // If the repo is already in a mismatched state, only `set` is allowed so we can repair it.
  if (parsed.action !== 'set' && (cache.major !== appMajor || sw.major !== appMajor)) {
    die(
      [
        'Reflex4You version mismatch detected:',
        `- APP_VERSION=${appMajor}`,
        `- CACHE_MINOR=${cache.raw}`,
        `- SW_URL=${sw.raw}`,
        '',
        'Refusing to proceed automatically. Use:',
        '  npm run reflex4you:version -- set <APP_VERSION> --cache <M.m> --sw <M.m>',
      ].join('\n'),
    );
  }

  const next = computeNext({ action: parsed.action, flags: parsed.flags, current: { appMajor, cache, sw } });

  const updatedMainJs = (() => {
    let text = mainJs;
    text = replaceOnce(
      text,
      /const\s+APP_VERSION\s*=\s*\d+\s*;/,
      `const APP_VERSION = ${next.appMajor};`,
      'APP_VERSION in apps/reflex4you/main.js',
    );
    // Keep any existing sw=… occurrences in sync.
    text = text.replace(/service-worker\.js\?sw=\d+\.\d+/g, `service-worker.js?sw=${next.sw.raw}`);
    return text;
  })();

  const updatedSwJs = replaceOnce(
    swJs,
    /const\s+CACHE_MINOR\s*=\s*'\d+\.\d+'\s*;/,
    `const CACHE_MINOR = '${next.cache.raw}';`,
    'CACHE_MINOR in apps/reflex4you/service-worker.js',
  );

  const updateSwUrlIn = (text, label) => {
    const re = /service-worker\.js\?sw=\d+\.\d+/g;
    if (!re.test(text)) die(`Failed to update service-worker.js?sw=… in ${label}`);
    return text.replace(re, `service-worker.js?sw=${next.sw.raw}`);
  };

  const updatedFormulaPage = updateSwUrlIn(formulaPage, 'apps/reflex4you/formula-page.mjs');
  const updatedExplorePage = updateSwUrlIn(explorePage, 'apps/reflex4you/explore-page.mjs');

  const updatedIndexHtml = (() => {
    let text = indexHtml;
    // Update the fallback pill content (JS will override after load).
    text = replaceOnce(
      text,
      /(<div\s+id="app-version-pill"[^>]*>\s*)v\d+(\s*<\/div>)/,
      `$1v${next.appMajor}$2`,
      'fallback #app-version-pill text in apps/reflex4you/index.html',
    );
    return text;
  })();

  const plan = [
    `APP_VERSION: ${appMajor} -> ${next.appMajor}`,
    `CACHE_MINOR: ${cache.raw} -> ${next.cache.raw}`,
    `SW_URL (sw=): ${sw.raw} -> ${next.sw.raw}`,
  ].join('\n');

  if (parsed.dryRun) {
    console.log('[dry-run] Would apply:\n' + plan);
    return;
  }

  await Promise.all([
    fs.writeFile(FILES.mainJs, updatedMainJs, 'utf8'),
    fs.writeFile(FILES.swJs, updatedSwJs, 'utf8'),
    fs.writeFile(FILES.formulaPage, updatedFormulaPage, 'utf8'),
    fs.writeFile(FILES.explorePage, updatedExplorePage, 'utf8'),
    fs.writeFile(FILES.indexHtml, updatedIndexHtml, 'utf8'),
  ]);

  console.log('Updated Reflex4You versions:\n' + plan);
}

main().catch((err) => die(err?.stack || String(err)));

