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

const API = 'https://app.all-hands.dev/api/v1';
const REPO = 'cenkmenk71-max/isbulkktc';
const PROVIDER = 'github';

// Issue label per lane, so a kickoff can point the agent at its own queue.
const ROLE_LABEL = {
  supabase: 'agent:backend',
  cloudflare: 'agent:infra',
  seo: 'agent:seo',
  geo: 'agent:seo',
  tasarim: 'agent:frontend',
  auth: 'agent:backend',
  urun: 'agent:backend',
  qa: 'agent:test',
  guvenlik: 'agent:test',
};

const LANES = {
  supabase: {
    brief: '01-supabase',
    branch: 'lane/supabase',
    wave: 1,
    scope: 'şema, RLS, indeks, pgTAP',
    skills: ['security', 'code-review', 'qa-changes'],
  },
  cloudflare: {
    brief: '02-cloudflare',
    branch: 'lane/cloudflare',
    wave: 2,
    scope: 'WAF/cache/DNS/SSL/bot denetimi',
    skills: ['security', 'code-review'],
  },
  seo: {
    brief: '03-seo',
    branch: 'lane/seo',
    wave: 0,
    scope: 'sitemap, canonical, hreflang, OG, route metadata',
    skills: ['evidence-based-citations', 'code-review', 'qa-changes'],
  },
  geo: {
    brief: '04-geo',
    branch: 'lane/geo',
    wave: 0,
    scope: 'llms.txt, yerel entity, AI görünürlük, JSON-LD üreticisi',
    skills: ['evidence-based-citations', 'code-review', 'qa-changes'],
  },
  tasarim: {
    brief: '05-tasarim',
    branch: 'lane/tasarim',
    wave: 0,
    scope: "UI/UX, motion, erişilebilirlik, guard'lar",
    skills: ['frontend-design', 'code-simplifier', 'code-review', 'qa-changes'],
  },
  auth: {
    brief: '06-auth',
    branch: 'lane/auth',
    wave: 0,
    scope: 'oturum akışı, e-posta şablonları, güvenlik',
    skills: ['security', 'code-review', 'qa-changes'],
  },
  urun: {
    brief: '07-urun',
    branch: 'lane/urun',
    wave: 0,
    scope: 'ürün & domain: ilan, şirket, aday, başvuru, paket, mesaj, belge',
    skills: ['code-review', 'qa-changes', 'code-simplifier'],
  },
  qa: {
    brief: '08-qa',
    branch: 'lane/qa',
    wave: 0,
    scope: 'bug & regresyon: entegrasyon, görsel, E2E dengesi',
    skills: ['qa-changes', 'code-review'],
  },
  guvenlik: {
    brief: '09-guvenlik',
    branch: 'lane/guvenlik',
    wave: 0,
    scope: 'tehdit modeli, yetki sınırları, saldırgan testler',
    skills: ['security', 'code-review'],
  },
  infra: {
    brief: '00-orchestration',
    branch: 'lane/infra',
    wave: 0,
    scope: 'CI, workflow, guard, lane otomasyonu',
    skills: ['github-actions', 'code-review'],
  },
};

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
