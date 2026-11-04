#!/usr/bin/env node
/**
 * The lane kickoff prompt — one source of truth.
 *
 * Two callers start a lane: `spawn-lanes.mjs` (a human asks for one) and
 * `lane-autopilot.mjs` (the schedule). Each used to build the prompt itself, and
 * the copies drifted: the autopilot's dropped the skills line, so a lane the
 * scheduler started was told to use fewer skills than one started by hand — and
 * `lanes.json`'s `skills` field became dead data on that path. Keeping the text
 * here means the two paths can only agree.
 *
 * The retry hint is the only caller-specific part: the autopilot re-spawns a
 * failed lane and passes the previous error so the retry is informed, not a
 * repeat.
 */

/**
 * Build the kickoff prompt for a lane.
 *
 * @param {string} name lane key in lanes.json (e.g. "infra")
 * @param {object} lane the lane's registry entry (label, brief, branch, skills)
 * @param {object} [context]
 * @param {number} [context.maxAttempts] retry budget to quote (default 3)
 * @param {string|null} [context.previousError] why the last attempt failed
 * @returns {string}
 */
export function kickoff(name, lane, context = {}) {
  const maxAttempts = context.maxAttempts ?? 3;
  const skillLine = lane.skills?.length
    ? `Kullanacağın skill'ler (.agents/skills/ altında): ${lane.skills.join(', ')}. ` +
      'Bunları görevine uygula — özellikle PR açmadan önce code-review ve qa-changes.'
    : '';
  const parts = [
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
      `\`gh issue list --state open --label ${lane.label}\`. Varsa onu al ` +
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
      'kırmızıysa düzelt ve tekrar çalıştır. Aynı hata ' +
      `${maxAttempts} denemede çözülmezse PR açma: \`agent:blocked\` etiketiyle ` +
      'issue aç, hatanın çıktısını ve denediklerini yaz. Sonsuz deneme yok — ' +
      `bütçe ${maxAttempts}.`,
    // A defect in another lane's files is a handoff, not a human blocker.
    // agent:blocked stops both the finder and the owner; agent:handoff gives
    // the work to the owner and keeps the team moving.
    'DEVİR: bulduğun eksik başka bir lane\'in dosyasındaysa düzeltme; sahibinin ' +
      'lane etiketiyle (`lane:<ad>`) ve `agent:handoff` ile issue aç, kanıtı koy. ' +
      '`agent:blocked` KULLANMA — o insan gerektiren tıkanma içindir ve hem ' +
      'seni hem sahibi durdurur. `agent:handoff` iştir, engel değildir.',
    'Kurallar: main\'e push YOK, kendi branch\'in (' +
      `${lane.branch}) + PR açık bırak; canlı Supabase'e yazma ` +
      '(tek yazar LANE-SUPABASE\'dir); sadece sahibi olduğun dosyalara yaz; ' +
      "CI'ı (bun run lint, typecheck, check:frontend-source, test:unit) yeşile getir.",
    'En güncel ve profesyonel kaynakları kullan: resmî dokümanlar, sürüme özel ' +
      'kütüphane dokümanı (context7), repo Q&A (deepwiki), W3C/schema.org gibi ' +
      'standartlar. Rapor formatı docs/lanes/00-orchestration.md sonunda.',
    skillLine,
  ];
  if (context.previousError) {
    parts.push(
      'ÖNCEKİ DENEME BAŞARISIZ OLDU. Hata: ' +
        `${context.previousError}. Bu hatayı tekrarlama; önce onu çöz.`,
    );
  }
  return parts.filter(Boolean).join('\n');
}
