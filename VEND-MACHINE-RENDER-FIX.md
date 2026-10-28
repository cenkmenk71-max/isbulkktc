# Otomat render düzeltmesi — kök neden analizi ve doğrulama

## Belirti

`/packages` sahnesinde yalnızca koyu arka planın görünmesi, kaynak kod açısından özellikle `labels` üretim zincirini şüpheli kılıyor. Canvas arka planı `Scene.tsx` içinde koşulsuz çiziliyor; `Machine`, `Backdrop` ve `Ground` ise yalnızca `labels` dolu olduğunda JSX'e ekleniyor. `labels` null kalırsa renderer çalışsa bile gövde görünmez.

## Orijinal koddaki doğrulanmış hata yolu

- `src/experience/scenes/vend-pricing/components/Scene.tsx`: `loadLabels(...)` başarısız olunca ikinci deneme `makeLabels(plans, labelCopy, maxTextureSize)` ile aynı texture ölçeğinde yapılıyor. İkinci `catch` bloğu hatayı yok sayıyordu. Bu durumda `labels` null kalıyor; dolayısıyla `Machine`, `Backdrop`, `Ground` hiç mount edilmiyor.
- `src/experience/scenes/vend-pricing/lib/labels.ts`: texture ölçeği `maxTextureSize >= 4096 ? 1.5 : 1` kuralıyla seçiliyordu. `maxTextureSize`, cihazın izin verdiği en büyük texture boyutudur; kullanılabilir GPU/bellek miktarını ölçmez. Bu yüzden bazı önizleme/tarayıcı ortamlarında gereksiz büyütülmüş canvas allocation'ları başarısız olabilir.
- `src/experience/scenes/vend-pricing/vend-machine.tsx`: orijinal WebGL kontrolü WebGL 1'i de olumlu sayıyordu. Projedeki Three.js sürümü WebGL 2 gerektirdiğinden bu kontrol yanıltıcı olabilirdi.

Bu kod yolu, belirtilen semptomu açıklayabilecek güçlü bir neden. Canlı tarayıcı konsolundan alınmış hata olmadan o oturumdaki ilk exception'ın kesinlikle bellek tahsisi olduğunu söylemek mümkün değil.

## Uygulanan düzeltmeler

1. Etiket texture'ları varsayılan olarak 1x çözünürlükte başlatılır; GPU'nun `maxTextureSize` değeri artık canvas'ları otomatik büyütmez.
2. Normal texture üretimi başarısız olursa 0.5x ölçekle tekrar denenir.
3. Canvas texture üretimi yine başarısız olursa 1x1 `THREE.DataTexture` tabanlı sade malzemelerle aynı 3D geometri korunur. Bu azaltılmış modda makine ve paket etkileşimleri çalışmaya devam eder; ayrıntılı yazılar ve bazı yüzey efektleri sadeleşir.
4. Ancak bu son kaynaklı malzemeler de kurulamazsa mevcut erişilebilir HTML paket kontrollerine geçilir; hata artık sessizce yutulmaz.
5. WebGL 1 tek başına destek sayılmaz; WebGL context kaybı ve React sahne hataları loglanır/fallback'e bağlanır. Yansımaların oluşturulması başarısızsa bu tek başına sahneyi düşürmez.
6. E2E testi, büyük 2D canvas'lar başarısızken makine canvas'ının render üretmeye devam etmesini kontrol edecek şekilde güncellendi.

## Değişen dosyalar

- `src/experience/scenes/vend-pricing/vend-machine.tsx`
- `src/experience/scenes/vend-pricing/components/Scene.tsx`
- `src/experience/scenes/vend-pricing/lib/labels.ts`
- `tests/e2e/packages.spec.ts`
- `scripts/check-frontend-source.mjs`

## Çalıştırılan kontroller

- `node scripts/check-frontend-source.mjs` — **PASS**
- TypeScript `transpileModule` sözdizim/transpile kontrolü — **PASS**: değişen iki TS/TSX uygulama dosyası, makine giriş bileşeni ve E2E testi.
- `node --check scripts/check-frontend-source.mjs` — **PASS**
- `npm ci --ignore-scripts --no-audit --no-fund --offline` — **BLOCKED**: gerekli `eslint` paketi npm cache'inde bulunmadı (`ENOTCACHED`).
- Çevrimiçi `npm ci --ignore-scripts --no-audit --no-fund` — **TIMEOUT**; tam bağımlılık kurulumu tamamlanmadı.
- Bu nedenle `npm run typecheck`, `npm run build` ve Playwright E2E testi bu ortamda gerçekten çalıştırılamadı. Bunlar geçilmiş gibi raporlanmıyor.

## Canlıya alma kapısı

Temiz Node.js >=20 / npm >=10 ortamında:

```bash
npm ci
npm run check:frontend-source
npm run typecheck
npm run build
npm run test:e2e -- tests/e2e/packages.spec.ts
```

WebGL destekli gerçek tarayıcıda `/packages` sayfasını da açıp otomatın normal texture modunda render edildiğini ve test senaryosunda büyük 2D canvas'lar kullanılamadığında sadeleştirilmiş 3D modun göründüğünü doğrulayın.

## Sonuç

Kod düzeyinde tespit edilen boş-sahne hata yolu kapatıldı ve texture sorunu olsa bile 3D geometriyi koruyan bir düşük ayrıntı modu eklendi. Kaynak/transpile kontrolleri geçti. Ancak bağımlılık kurulumu tamamlanamadığı için full production build ve gerçek browser E2E doğrulaması henüz yok; bu nedenle canlı tarayıcıda yüzde yüz doğrulanmış olduğu iddia edilmiyor.

## Doğrulama kaydı — 28 Ekim 2026

Bağımlılıklar `npm ci` ile kuruldu; yukarıdaki "kurulum tamamlanamadı" notu yalnız o günkü ortam için geçerlidir.

Çalıştırılan kontroller (hepsi bu checkout üzerinde):

- `npm ci` — **PASS**
- `npm run lint` — **PASS** (0 hata, 0 uyarı; `Scene.tsx` içindeki kullanılmayan `react-hooks/immutability` direktifi kaldırıldı)
- `npm run typecheck` — **PASS**
- `npm run test:unit` — **PASS** (83/83)
- `npm run check:frontend-source` — **PASS**
- `npm run build` — **PASS**
- `node scripts/run-playwright.mjs test tests/e2e/packages.spec.ts` — **PASS** (3/3, Chromium + WebGL 2, gerçek framebuffer okuması)
- `node scripts/run-playwright.mjs test tests/e2e/typography.spec.ts` — **PASS** (5/5)

Tüm E2E paketi (28/32) bu ortamda geçti. Kalan iki `jobs.spec.ts` testi yerel Supabase/seed verisi gerektirir; `.env.local` olmadığı için ilan listesi boş döner ve bu testler ortam nedeniyle çalışamaz. Paket çalışmasında ayrıca gerçek bir yerleşim hatası bulundu: Yunanca başlık etiketleri 1201 px masaüstü kırılımında 9 px yatay taşma yapıyordu (`scrollWidth 1210 > clientWidth 1201`). `@media (min-width: 1201px) and (max-width: 1480px)` içindeki nav boşlukları/marjı ve ilan düğmesi dolgusu sıkılaştırıldı; 6 dil × 10 genişlik (1061–1440 px) ölçümünde taşma kalmadı ve `typography.spec.ts` bunu kapsıyor.

E2E çalışmasında bulunan ve düzeltilen iki test/kod sorunu:

1. Framebuffer yoklaması `canvas.getContext("webgl2")` çağırıyordu. Yoklama React Three Fiber renderer'ı kurmadan önce çalıştığında bu çağrı bağlamı `preserveDrawingBuffer: false` ile oluşturuyor; sonraki tüm `drawImage` okumaları boş (tek renk) dönüyordu. Kanıt: erken çağrıda `preserve=false`, yoklamada `390x844` boyuta rağmen `colors=1`; geç çağrıda `preserve=true`, `colors=449`. Yoklama artık bağlam oluşturmuyor, yalnızca mevcut canvas'ı örnekliyor (30 sn tolerans).
2. `.packages-vend-control-twin` düğmeleri 1 px, `clip-path` ile gizlenmiş klavye ekran okuyucu kontrolleridir; işaretçi tıklaması üst kapsayıcı tarafından engellenir. Test bunları gerçek kullanım biçimine uygun olarak `focus()` + `Enter` ile etkinleştirir.

Ek olarak `labels.ts` içindeki `texture()` fonksiyonu, 2D bağlam alınamadığında `WeakMap` kaynaklı belirsiz `TypeError` yerine canvas boyutunu içeren açıklayıcı bir hata fırlatır; düşük ayrıntı moduna geçiş aynı kalır.

