#!/usr/bin/env node
/**
 * Lane spawner — start the parallel lane team on demand.
 *
 * The lane programme (docs/lanes/) was designed for a human to open one chat
 * per lane and paste the kickoff prompt. This script does that part: it starts
 * every lane as its own conversation, each in its own sandbox with its own
 * clone, all at the same time. The lanes never share a working tree, so they
 * cannot overwrite each other; they meet only at `main`, through pull requests.
 *
 * Usage:
 *   node scripts/spawn-lanes.mjs --dry-run              # print, start nothing
 *   node scripts/spawn-lanes.mjs seo geo tasarim        # start three lanes
 *   node scripts/spawn-lanes.mjs --all                  # start every lane
 *
 * Needs OPENHANDS_API_KEY in the environment. Each started lane consumes
 * sandbox budget, so nothing starts without an explicit lane list or --all.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const API = 'https://app.all-hands.dev/api/v1';

// The lane team lives in lanes.json so the spawner, the collision detector and
// the autopilot read the same source.
const HERE = dirname(fileURLToPath(import.meta.url));
const REGISTRY = JSON.parse(readFileSync(join(HERE, 'lanes.json'), 'utf8'));
const REPO = REGISTRY.repo;
const PROVIDER = REGISTRY.provider;
const LANES = REGISTRY.lanes;
const ROLE_LABEL = Object.fromEntries(
  Object.entries(LANES).map(([name, lane]) => [name, lane.label]),
);

function kickoff(name) {
  const lane = LANES[name];
  const skillLine = lane.skills.length
    ? `Kullanacağın skill'ler (.agents/skills/ altında): ${lane.skills.join(', ')}. ` +
      'Bunları görevine uygula — özellikle PR açmadan önce code-review ve qa-changes.'
    : '';
  return [
    `isbulkktc reposunda paralel "lane" programında çalışacaksın. Lane: ${name}.`,
    'Önce şu dosyaları OKU: docs/lanes/00-orchestration.md ve docs/lanes/' +
      `${lane.brief}.md. Ayrıca AGENTS.md'yi oku. Sonra kendi lane'inin görevini uygula.`,
    // The sandbox ships neither bun nor unzip and has no usable sudo, so the
    // gates cannot run until bun is installed. bootstrap-bun.sh handles that
    // without sudo (extracts the release zip with Python).
    'KURULUM: kalite kapılarını çalıştırmadan ÖNCE bun gerekir. Sandbox\'ta bun ' +
      've unzip yoktur, sudo çalışmaz. Şunu çalıştır: ' +
      '`bash scripts/bootstrap-bun.sh` ve sonra `export PATH="$HOME/.local/bin:$PATH"`. ' +
      'Bun kurulu değilse kapıları çalıştıramazsın ve PR açamazsın.',
    'Kurulumdan sonra bağımlılıkları kur: `bun install --frozen-lockfile`.',
    // A lane with no bounded task stops early (the first wave proved it: geo
    // spent 1.4M tokens and produced nothing). Point it at its labelled issues.
    'SOMUT İŞ: önce sana atanmış açık issue var mı bak: ' +
      `\`gh issue list --state open --label ${ROLE_LABEL[name]}\`. Varsa onu al ` +
      '(içindeki kanıtı doğrula, düzelt, test et). Yoksa kendi brief\'indeki ' +
      'hedeflerden en yüksek etkili olanı seç ve sınırlı tut.',
    // The audit protocol turns "find one bug" into "examine every file". The
    // brief names the domain; AUDIT.md names the dimensions to check per file.
    'MICRO-DENETİM: docs/lanes/AUDIT.md\'yi oku ve uygula. Sahip olduğun her ' +
      'dosyayı `git ls-files` ile listele, dosya dosya ilerle, her boyutu ' +
      '(doğruluk, hata yolu, yetki, erişilebilirlik, kontrast, RTL, linkler, ' +
      'mantık, sınır girdiler) tek tek sor. Bulguları kanıtla (dosya:satır, ' +
      'gözlenen, beklenen, etki) ve PR gövdesine tablo hâlinde yaz. Atladığın ' +
      'dosya varsa "bakılmadı" diye işaretle — sessizce geçme. Tek bir bug ' +
      'düzeltip durmak yeterli değil; alanı tara.',
    // Autonomy: the agent must verify its own work before opening the PR, and
    // retry a bounded number of times. The orchestrator re-spawns a failed lane
    // with the failure detail, so a fix round is a fresh, informed attempt.
    'KENDİNİ DOĞRULA: PR açmadan önce değişikliğini kendin test et. Bir gate ' +
      'kırmızıysa düzelt ve tekrar çalıştır. Aynı hata üç denemede çözülmezse ' +
      'PR açma: `agent:blocked` etiketiyle issue aç, hatanın çıktısını ve ' +
      'denediklerini yaz. Sonsuz deneme yok — bütçe 3.',
    'Kurallar: main\'e push YOK, kendi branch\'in (' +
      `${lane.branch}) + PR açık bırak; canlı Supabase'e yazma ` +
      '(tek yazar LANE-SUPABASE\'dir); sadece sahibi olduğun dosyalara yaz; ' +
      "CI'ı (bun run lint, typecheck, check:frontend-source, test:unit) yeşile getir.",
    'En güncel ve profesyonel kaynakları kullan: resmî dokümanlar, sürüme özel ' +
      'kütüphane dokümanı (context7), repo Q&A (deepwiki), W3C/schema.org gibi ' +
      'standartlar. Rapor formatı docs/lanes/00-orchestration.md sonunda.',
    skillLine,
  ]
    .filter(Boolean)
    .join('\n');
}

async function startLane(name, key) {
  const lane = LANES[name];
  const response = await fetch(`${API}/app-conversations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      selected_repository: REPO,
      selected_branch: 'main',
      git_provider: PROVIDER,
      title: `LANE-${name}`,
      initial_message: {
        role: 'user',
        content: [{ type: 'text', text: kickoff(name) }],
        run: true,
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`${name}: HTTP ${response.status} ${await response.text()}`);
  }
  const body = await response.json();
  return { name, taskId: body.id, branch: lane.branch };
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const all = args.includes('--all');
const names = args.filter((a) => !a.startsWith('--'));

// A bare `--dry-run` previews the whole team; otherwise a lane list or --all
// is required so nothing starts by accident.
if (!all && names.length === 0 && !dryRun) {
  console.error('Give lane names or --all. Known lanes:');
  for (const [name, lane] of Object.entries(LANES)) {
    console.error(`  ${name.padEnd(12)} wave ${lane.wave}  ${lane.scope}`);
  }
  process.exit(1);
}

const targets = all || names.length === 0 ? Object.keys(LANES) : names;
for (const name of targets) {
  if (!LANES[name]) {
    console.error(`Unknown lane "${name}". Known: ${Object.keys(LANES).join(', ')}`);
    process.exit(1);
  }
}

if (dryRun) {
  for (const name of targets) {
    console.log(`would start ${name} -> branch ${LANES[name].branch}`);
  }
  process.exit(0);
}

const key = process.env.OPENHANDS_API_KEY;
if (!key) {
  console.error('OPENHANDS_API_KEY is not set');
  process.exit(1);
}

const results = await Promise.allSettled(targets.map((n) => startLane(n, key)));
let failed = 0;
for (const result of results) {
  if (result.status === 'fulfilled') {
    console.log(`started ${result.value.name} -> ${result.value.branch} (task ${result.value.taskId})`);
  } else {
    failed += 1;
    console.error(`FAILED ${result.reason}`);
  }
}
process.exit(failed === 0 ? 0 : 1);
