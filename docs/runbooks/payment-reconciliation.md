# Runbook: V4 IBAN sipariş ve ödeme mutabakatı

## Durum

**Gerçek IBAN ödemesi kapalıdır.** Migration henüz ödeme/sipariş/ledger
tablolarını, `paid` RPC'sini, billing admin atamasını veya banka referans
kapsamını oluşturmaz. Bu belge prosedür sözleşmesidir; işlemsel sistem veya
gerçek banka talimatı değildir.

## Sistem kurulmadan önce

1. İşletme sahibi, gerçek yasal alıcı, IBAN, banka, para birimi, paket tutarı,
   transfer süresi, eksik/fazla/üçüncü kişi/tekrar ödemesi ve iade/itiraz
   şartlarını yazılı olarak doğrulasın.
2. `billing_admin` aktörünün güvenilir MFA ve kurtarma yolu, ayrı rol bootstrap,
   SLA, izin kapsamı ve actor-attributed append-only audit'i oluşturulsun.
3. Kullanıcıya talimat veren ve order alanı server'da tutulan versioned
   snapshot'ı, paylaşılan bank reference uniqueness policy'si ve banka
   mutabakatı ledger transaction'ı hazırlansın.
4. Receipt private-bucket upload ve izni olmayanların indirme hatası,
   karantina taraması ve kabul/red delilinin lifecycle'ı doğrulansın.
5. Aynı order/reference için eşzamanlı çift onay, tekrar, amount/currency
   uyuşmazlığı, transaction rollback ve ledger/balance yeniden hesaplama
   pgTAP/integration testleri CI'da geçsin.

## Gelecekteki inceleme prosedürü

- Dekont veya kullanıcı tarafından beyan edilen transferi kanıt saymayın.
- Yalnız ilgili sipariş ve kullanıcının şirket üyeliği doğrulanınca sınırlı
  beyanı açın; bankada gerçekten görünen transferi, tutarı/para birimini,
  hedef hesabı, işlem zamanını ve tekrar durumunu ayrı doğrulayın.
- İnceleyenin rolünü her kararda tekrar doğrulayın. Para ve referans verisini
  log veya serbest biçimli destek notuna kopyalamayın.
- Yetersiz/tekrar/yanlış ödemeyi gerekçeyle incelemeye bırakın; sessiz `paid`
  ya da otomatik kredi değişikliği yapmayın.
- Onay yalnız tek transaction içindeki kilit, state guard, unique banka
  referansı ve tekil idempotency key, ledger delta, bakiye ve audit kaydı
  birlikte commit olunca tamamlanır. Hata olursa tüm transaction rollback;
  elle bakiye güncellemesi yasak.
- Hak tahsisi/ret/iade sonrası order/payment audit ID'sini yalnız ilgili
  kullanıcılara bildirin. Kullanıcıya banka gerçekleşmesinden önce
  tamamlanma/instant SLA vaadi vermeyin.

## Olay ve uzlaştırma

Mükerrer referans, amount farkı, transaction/bakiye uyuşmazlığı veya
şüpheli admin işlemi görülürse yeni `paid` kararını durdurun; kanıtı değiştirmeyin;
güvenlik runbook'unu uygulayın. Gün sonunda salt-okunur ledger yeniden
hesaplaması ile bakiye uyuşmazlığını raporlayın. Deneme ortamı tamamlanana
dek gerçek üretim hareketi ve manual SQL düzeltmesi yapmayın.
