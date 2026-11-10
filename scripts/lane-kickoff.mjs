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
 * @param {{number: number, checks: string[]}} [context.redPr] an open PR whose
 *   required check failed; the lane is re-spawned to fix it, not to start over
 * @param {boolean} [context.recovery] a respawn after the attempt budget was
 *   spent; the lane must do ONE small commit, not survey its whole area
 * @param {number} [context.issueNumber] the exact issue the autopilot picked for
 *   this lane; the lane must work it, not re-pick from its label list
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
    // The lane's own brief is the whole task. It used to be told to read
    // 00-orchestration.md + AUDIT.md + its brief + every owned file *before*
    // acting — and that is exactly the loop: one lane read its 67 KB brief 21
    // times in 80 minutes and never committed. Read the one brief that names the
    // work, then act.
    'Önce SADECE kendi brief\'ini oku: docs/lanes/' +
      `${lane.brief}.md. Ayrıca AGENTS.md'yi oku (kısa, kurallar için). ` +
      '00-orchestration.md ve AUDIT.md\'yi baştan OKUMA — gerekirse ilgili bölümüne bak.',
    // Action before exhaustive reading. Progress only counts when it is on disk:
    // a summary can drop the plan, but a commit cannot be summarised away.
    'EYLEM ÖNCE (EN ÖNEMLİ): okumakla saatler geçirme. İlk ~10 dakikada brief\'inden ' +
      'küçük ama GERÇEK bir düzeltme seç, uygula ve hemen COMMIT ET (`git add -p` + ' +
      '`git commit`). Diske yazılan ilerleme bağlam kısalsa bile kaybolmaz; sadece ' +
      'okuduğun hiçbir şey kaydedilmez. İlk commit\'ten sonra kalanına devam et.',
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
    //
    // Query the precise `lane:<name>` label, not the shared broad one: `qa`,
    // `guvenlik` and `verify` all carry `agent:test`, so a broad query hands the
    // same issue to several lanes and they duplicate the work. `hasLabelledWork`
    // already matches precisely first; the prompt must agree with that gate.
    // The autopilot picks a lane's work by oldest-first FIFO across handoffs and
    // labelled issues, and *claims* that exact issue so no other lane takes it.
    // The prompt used to leave the choice open ("look for an issue, else pick
    // from your brief"), so the lane re-picked from its own `gh` list (newest
    // first) and worked a *different* issue than the one the autopilot claimed
    // and recorded — the oldest labelled issue was claimed every pass and never
    // produced (#398). Pinning the issue the autopilot picked closes that gap.
    context.issueNumber
      ? 'SOMUT İŞ: bu turda TAM OLARAK şu issue üzerinde çalış: ' +
        `#${context.issueNumber}. Onu al (\`gh issue view ${context.issueNumber}\`), ` +
        'içindeki kanıtı doğrula, düzelt, test et. Kendi etiket listenden BAŞKA ' +
        'bir issue SEÇME — bu numara senin için seçildi ve sahiplenildi.'
      : 'SOMUT İŞ: önce sana atanmış açık issue var mı bak: ' +
        `\`gh issue list --state open --label ${lane.laneLabel ?? lane.label}\`. Varsa onu al ` +
        '(içindeki kanıtı doğrula, düzelt, test et). Yoksa kendi brief\'indeki ' +
        'hedeflerden en yüksek etkili olanı seç ve sınırlı tut.',
    // The audit dimensions are a checklist for the ONE fix you picked, not a
    // mandate to sweep every owned file before committing. "Scan the whole area"
    // is what turned a bounded task into an endless read (the leak this prompt
    // now fights).
    'DENETİM: docs/lanes/AUDIT.md\'deki boyutları (doğruluk, hata yolu, yetki, ' +
      'erişilebilirlik, kontrast, RTL, linkler, mantık, sınır girdiler) SEÇTİĞİN ' +
      'düzeltmeye uygula — sahip olduğun her dosyayı taramak zorunda değilsin. ' +
      'Bulguyu kanıtla (dosya:satır, gözlenen, beklenen, etki) ve PR gövdesine yaz.',
    // Context discipline. A lane that re-reads its brief and starts over is
    // losing its plan to condensation: the transcript is summarised faster than
    // it can work, so each summary drops the plan and the agent restarts from
    // the top (one lane read its 67 KB brief 21 times in 80 minutes and made no
    // commit). Telling the lane to read once, keep a task list, and commit the
    // first small fix breaks that cycle.
    'BAĞLAM DİSİPLİNİ: kendi brief\'ini BİR KEZ oku, ' +
      'sonra göreve başla — aynı dosyayı tekrar tekrar okuma. İlerlemeni bir görev ' +
      'listesinde tut; aynı adımı ikinci kez yapıyorsan planını kaybetmişsin demektir, ' +
      'yeniden okumak yerine hemen uygula ve commit et. Tüm alanı taramayı bitirmeden ' +
      'ilk küçük düzeltmeyi commit et — ilerleme diske yazılırsa bağlam kısalsa bile kaybolmaz.',
    // Parallel lanes push while `main` moves. A PR whose head conflicts with
    // main gets **no CI run at all** — GitHub fires no check-run for a
    // CONFLICTING head, and `gh pr checks` shows only an unrelated failing
    // check, so the PR looks "never triggered" while it is really unverified
    // (#304, PR #301). Rebasing onto the current `main` immediately before
    // opening the PR is what keeps the gate attached.
    // A stale lane branch is 100-250 commits behind main, so the lane's first
    // `rebase` is a wall of conflicts and it gives up (or never starts). Start
    // from main instead: `checkout -B` resets the branch to origin/main in one
    // step, so the diff the lane commits is against today's tree, not a week-old
    // one. The branch name is unchanged, so the PR still lands on `lane/<name>`.
    'DALI TAZE BAŞLAT: çalışmaya başlarken dalını main\'den sıfırla — ' +
      `\`git fetch origin main && git checkout -B ${lane.branch} origin/main\`. ` +
      'Eski dalı rebase etmeye uğraşma; dalın main\'in yüzlerce commit gerisinde ' +
      've rebase çakışma duvarına döner. Sonra çalışmanı commit et.',
    'GÜNCEL TUT: PR açmadan hemen önce tekrar `git fetch origin main && git rebase ' +
      'origin/main` çalıştır. Çakışma varsa çöz ya da dur — çakışan (CONFLICTING) ' +
      'bir PR açma; o PR\'a CI hiç çalışmaz ve doğrulanmamış kalır.',
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
  if (context.redPr) {
    const checks = context.redPr.checks ?? [];
    const detail =
      checks.length > 0
        ? `kırmızı (${checks.join(', ')})`
        : "main ile ÇAKIŞIYOR (CONFLICTING) — çakışan bir PR'a CI hiç çalışmaz";
    const fix =
      checks.length > 0
        ? `\`gh pr checks ${context.redPr.number}\` ile hatayı oku, düzelt`
        : '`git fetch origin main && git rebase origin/main` ile çakışmayı çöz';
    parts.push(
      `KENDİ PR'INI DÜZELT: açık PR #${context.redPr.number} ${detail}. ` +
        `Yeni iş başlatma — önce bu PR'ı düzelt: ${fix}, kendi branch'ine ` +
        'commit + push et. PR açık kalır; yeni PR açma.',
    );
  }
  if (context.previousError) {
    parts.push(
      'ÖNCEKİ DENEME BAŞARISIZ OLDU. Hata: ' +
        `${context.previousError}. Bu hatayı tekrarlama; önce onu çöz.`,
    );
  }
  if (context.recovery) {
    // A lane that burned its whole budget without landing anything did it by
    // surveying instead of shipping. The recovery respawn narrows the task to a
    // single small, bounded commit so the pass produces a PR even when the lane
    // never finishes its area.
    parts.push(
      'KURTARMA TURU: önceki denemeler bütçeyi tüketti ve hiçbir şey birleşmedi. ' +
        'Bu turda alanı taramaya ÇALIŞMA. Sadece brief\'inden TEK küçük, sınırlı bir ' +
        'düzeltme seç, uygula, test et ve PR aç. Tek commit yeterli — kapsamı ' +
        'genişletme.',
    );
  }
  return parts.filter(Boolean).join('\n');
}
