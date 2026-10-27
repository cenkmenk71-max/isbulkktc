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
