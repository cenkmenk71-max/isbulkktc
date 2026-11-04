import { GUIDE_UPDATED, type Guide } from "./types";

export const trGuides: readonly Guide[] = [
  {
    slug: "kktc-is-bulma-rehberi",
    title: "KKTC'de İş Bulma Rehberi",
    description:
      "Kuzey Kıbrıs'ta iş arayanlar için adım adım rehber: doğru ilanları bulma, başvuru hazırlama, mülakat ve işe alım süreci.",
    eyebrow: "KARİYER REHBERİ",
    lead: "Kuzey Kıbrıs'ta iş aramak, doğru kanalları ve doğru sıralamayı bilmekle başlar. Bu rehber, ilan bulmaktan işe başlamaya kadar izlemeniz gereken adımları anlatır.",
    readMinutes: 7,
    updated: GUIDE_UPDATED,
    sections: [
      {
        heading: "1. Aradığınız işi netleştirin",
        body: [
          "Başvuru yapmadan önce hangi pozisyonu, hangi ilçede ve hangi çalışma düzeninde istediğinizi belirleyin. Kuzey Kıbrıs altı ilçeye ayrılır: Lefkoşa, Mağusa (Gazimağusa), Girne, Güzelyurt, İskele ve Lefke. Ada içi ulaşım mesafeleri düşünüldüğünde ilçe seçimi, maaş kadar belirleyicidir.",
          "Çalışma düzeni de önemlidir: iş yerinde, hibrit veya uzaktan. Turizm ve hizmet sektörü ağırlıklı olarak iş yerinde çalışır; yazılım, tasarım ve dijital pazarlama rollerinde uzaktan çalışma daha yaygındır.",
        ],
        list: [
          "Pozisyon adı (ör. muhasebe personeli, satış temsilcisi, yazılım geliştirici)",
          "İlçe tercihi ve ulaşım durumu",
          "Çalışma türü: tam zamanlı, yarı zamanlı, sözleşmeli, geçici, staj, serbest",
          "Çalışma düzeni: iş yerinde, hibrit, uzaktan",
        ],
      },
      {
        heading: "2. İlanları doğru filtreleyin",
        body: [
          "İlan panosunda arama kutusuna pozisyon veya şirket adı yazabilir, ardından ilçe, çalışma türü ve çalışma düzeni filtrelerini ekleyebilirsiniz. Filtreleri birlikte kullanmak, onlarca ilan arasından size uygun olanı hızla bulmanızı sağlar.",
          "Her ilçe için ayrı sayfa bulunur: Lefkoşa iş ilanları, Girne iş ilanları ve diğerleri. Belirli bir çalışma türü arıyorsanız tam zamanlı, yarı zamanlı, staj veya serbest çalışma sayfaları da ayrıdır.",
        ],
      },
      {
        heading: "3. Başvurunuzu hazırlayın",
        body: [
          "Kuzey Kıbrıs'ta işverenlerin çoğu Türkçe özgeçmiş bekler; uluslararası şirketlerde İngilizce özgeçmiş de kabul edilir. İki sürüm hazır bulundurmak avantaj sağlar.",
          "Özgeçmişinizde deneyim, eğitim ve becerileri net biçimde yazın. İlanın istediği niteliklere karşılık gelen maddeleri öne çıkarın. Uzun ve süslü cümleler yerine kısa, ölçülebilir ifadeler kullanın.",
        ],
        list: [
          "İletişim bilgileri (e-posta ve telefon)",
          "Kısa bir profesyonel özet",
          "İş deneyimi — en yeniden eskiye",
          "Eğitim bilgileri",
          "Beceriler ve varsa sertifikalar",
          "Diller ve seviyeleri",
        ],
      },
      {
        heading: "4. Başvuruyu gönderin ve takip edin",
        body: [
          "Platform üzerinden başvurduğunuzda, başvurunuz ilanı veren işverene iletilir. Başvurularınızı aday panelinizden takip edebilirsiniz: hangi ilana başvurduğunuzu, başvurunuzun hangi aşamada olduğunu ve işverenin başvurunuzu görüntüleyip görüntülemediğini görürsünüz.",
          "İletişim bilgilerinizi paylaşmayı seçerseniz, işveren sizinle doğrudan e-posta üzerinden iletişime geçebilir. Bu seçeneği kullanmak için e-posta adresinizin doğrulanmış olması gerekir.",
        ],
      },
      {
        heading: "5. Mülakat ve işe alım",
        body: [
          "Mülakata çağrıldığınızda işverenin faaliyet alanını ve ilanı yeniden okuyun. Kuzey Kıbrıs'ta mülakatlar genellikle iş yerinde yüz yüze yapılır; bazı rollerde telefon veya görüntülü görüşme ile başlar.",
          "Görüşmede maaş, çalışma saatleri, izin ve deneme süresi gibi konuları netleştirin. Koşulları yazılı olarak almak, sonradan çıkabilecek anlaşmazlıkları önler.",
        ],
      },
      {
        heading: "6. Sabırlı olun ve düzenli başvurun",
        body: [
          "İş arama bir süreçtir. Her hafta düzenli olarak yeni ilanları kontrol edin ve uygun gördüğünüz her pozisyona başvurun. Tek bir başvuruya bağlı kalmak yerine, aynı hafta içinde birkaç uygun ilana başvurmak sonuç alma şansınızı artırır.",
          "Başvurularda reddedilmek normaldir ve kişisel değerlendirme değildir. Geri bildirim istemek, sonraki başvurularınızı güçlendirir.",
        ],
      },
    ],
  },
  {
    slug: "kktc-cv-hazirlama-rehberi",
    title: "KKTC İçin CV Hazırlama Rehberi",
    description:
      "Kuzey Kıbrıs işverenlerinin beklediği özgeçmiş nasıl hazırlanır: bölümler, uzunluk, dil seçimi ve sık yapılan hatalar.",
    eyebrow: "KARİYER REHBERİ",
    lead: "İyi bir özgeçmiş, mülakata giden yolun ilk adımıdır. Bu rehber, Kuzey Kıbrıs işverenlerinin beklediği CV yapısını ve kaçınmanız gereken hataları anlatır.",
    readMinutes: 6,
    updated: GUIDE_UPDATED,
    sections: [
      {
        heading: "Özgeçmiş kaç sayfa olmalı?",
        body: [
          "Yeni mezun veya birkaç yıllık deneyimi olan adaylar için bir sayfa idealdir. Beş yıldan fazla deneyimi olanlar iki sayfaya çıkabilir. Üç sayfayı geçen özgeçmişler, işe alım uzmanları tarafından nadiren baştan sona okunur.",
        ],
      },
      {
        heading: "Hangi bölümler bulunmalı?",
        body: [
          "Türkiye ve Kuzey Kıbrıs iş piyasasında beklenen sıralama şudur: iletişim bilgileri, kısa profesyonel özet, iş deneyimi, eğitim, beceriler, diller ve sertifikalar.",
        ],
        list: [
          "Ad soyad ve iletişim — e-posta ve cep telefonu mutlaka yer almalı",
          "Profesyonel özet — iki üç cümle, ne yaptığınızı ve ne aradığınızı anlatır",
          "İş deneyimi — şirket, pozisyon, tarih aralığı ve yaptığınız işin sonucu",
          "Eğitim — okul, bölüm, mezuniyet yılı",
          "Beceriler — pozisyonla ilgili teknik ve kişisel beceriler",
          "Diller — seviye belirterek (başlangıç, orta, iyi, akıcı)",
        ],
      },
      {
        heading: "Türkçe mi, İngilizce mi?",
        body: [
          "Kuzey Kıbrıs'taki yerel şirketlerin büyük çoğunluğu Türkçe özgeçmiş bekler. Turizm, uluslararası ticaret ve teknoloji şirketlerinde İngilizce özgeçmiş de kabul edilir; bazıları özellikle İngilizce ister.",
          "En güvenli yol iki sürüm hazırlamaktır. Başvurduğunuz ilanın diline bakarak hangisini göndereceğinize karar verin.",
        ],
      },
      {
        heading: "Sık yapılan hatalar",
        body: [
          "İşe alım uzmanlarının en sık şikayet ettiği noktalar tekrarlayan, ölçüsüz ve özensiz özgeçmişlerdir.",
        ],
        list: [
          "Yazım ve dilbilgisi hataları — göndermeden önce mutlaka okuyun",
          "Her başvuruya aynı genel özgeçmişi göndermek",
          "Sadece görevleri yazmak, sonucu yazmamak",
          "Gerçek dışı veya abartılı deneyim beyanı",
          "Fotoğraf, yaş, medeni durum gibi gereksiz kişisel bilgiler",
          "Ulaşılamayan e-posta veya kapalı telefon numarası",
        ],
      },
      {
        heading: "Ölçülebilir ifadeler kullanın",
        body: [
          "\"Satış yaptım\" yerine \"aylık satış hedefini %20 aşarak üç ay üst üste en yüksek ciro yapan personel oldum\" gibi somut ifadeler, deneyiminizi çok daha güçlü anlatır.",
          "Sayı, oran ve sonuç içeren maddeler, işe alım uzmanının sizi hatırlamasını sağlar.",
        ],
      },
    ],
  },
  {
    slug: "kktc-calisma-izni-ve-haklar",
    title: "KKTC'de Çalışma İzni ve Çalışan Hakları",
    description:
      "Kuzey Kıbrıs'ta çalışma izni, sözleşme, deneme süresi, çalışma saatleri ve izin hakları hakkında bilmeniz gerekenler.",
    eyebrow: "KARİYER REHBERİ",
    lead: "İşe başlamadan önce haklarınızı ve yükümlülüklerinizi bilmek, sağlıklı bir iş ilişkisinin temelidir. Bu rehber, sık sorulan noktaları özetler.",
    readMinutes: 6,
    updated: GUIDE_UPDATED,
    sections: [
      {
        heading: "Çalışma izni neden gerekli?",
        body: [
          "Kuzey Kıbrıs'ta çalışmak isteyen yabancı uyruklu kişilerin çalışma izni alması gerekir. İzin başvurusu genellikle işveren tarafından yapılır; işveren, sizi çalıştıracağını beyan ederek ilgili kuruma başvurur.",
          "İzin süreci ve istenen belgeler zaman içinde değişebilir. Başvuru öncesinde en güncel bilgiyi ilgili resmî kurumdan veya işvereninizin insan kaynakları biriminden teyit edin.",
        ],
      },
      {
        heading: "İş sözleşmesinde nelere dikkat etmeli?",
        body: [
          "Sözlü anlaşmalar yerine yazılı sözleşme isteyin. Sözleşme, tarafların yükümlülüklerini ve koşulları netleştirir.",
        ],
        list: [
          "Pozisyon adı ve görev tanımı",
          "Ücret ve ödeme dönemi",
          "Çalışma saatleri ve haftalık çalışma günü",
          "Deneme süresi (varsa) ve süresi",
          "Yıllık ücretli izin hakkı",
          "Fesih koşulları ve ihbar süresi",
        ],
      },
      {
        heading: "Çalışma saatleri ve fazla mesai",
        body: [
          "Kuzey Kıbrıs'ta haftalık normal çalışma süresi ve fazla mesai kuralları mevzuatla belirlenmiştir. Fazla mesai genellikle normal ücretin belirli bir oranı üzerinden ödenir.",
          "İşe başlarken haftalık çalışma düzeninizi ve fazla mesai beklentisini netleştirin. Özellikle turizm, perakende ve hizmet sektöründe sezon yoğunluğu çalışma saatlerini etkileyebilir.",
        ],
      },
      {
        heading: "İzin hakları",
        body: [
          "Çalışanların yıllık ücretli izin, hastalık izni ve doğum izni gibi yasal hakları vardır. İzin süreleri kıdeme ve sektöre göre değişebilir.",
          "İzin taleplerinizi yazılı olarak iletmek ve onay almak, hem sizin hem işverenin planlamasını kolaylaştırır.",
        ],
      },
      {
        heading: "Ücret ve kesintiler",
        body: [
          "Brüt ücret ile elinize geçen net ücret farklıdır. İşe başlamadan önce brüt ücret, yasal kesintiler ve net ödemenin ne olacağını sorun.",
          "Maaş ödemelerinin hangi gün ve hangi yolla yapıldığını (banka transferi gibi) baştan öğrenmek, sonradan gecikme yaşanmasını önler.",
        ],
      },
    ],
  },
];
