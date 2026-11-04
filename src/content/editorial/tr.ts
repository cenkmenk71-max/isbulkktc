import { ARTICLE_PUBLISHED, ARTICLE_UPDATED, type Article } from "./types";

export const trArticles: readonly Article[] = [
  {
    slug: "kktc-is-piyasasi-guncel-gorunum",
    title: "KKTC İş Piyasası: Hangi Sektörler İşe Alım Yapıyor?",
    description:
      "Kuzey Kıbrıs'ta hangi sektörlerin düzenli olarak eleman aradığını ve iş arayanların hangi alanlara yönelmesi gerektiğini ele alıyoruz.",
    category: "İş Piyasası",
    readMinutes: 5,
    published: ARTICLE_PUBLISHED,
    updated: ARTICLE_UPDATED,
    sections: [
      {
        heading: "İşe alımın yoğunlaştığı alanlar",
        body: [
          "Kuzey Kıbrıs ekonomisi ağırlıklı olarak hizmetler, turizm, inşaat ve perakende üzerine kuruludur. Bu dört alan, ilan panosunda en sık karşılaşılan işveren gruplarını oluşturur.",
          "Turizm ve konaklama, özellikle Girne ve İskele çevresinde sezon boyunca sürekli eleman arar. İnşaat ve yapı malzemeleri sektörü Lefkoşa ve Mağusa'da yoğunlaşır. Perakende ve mağazacılık ise her ilçede görülür.",
        ],
        list: [
          "Turizm, otelcilik ve yiyecek-içecek",
          "İnşaat, yapı malzemeleri ve teknik servis",
          "Perakende, mağazacılık ve satış",
          "Muhasebe, finans ve ofis yönetimi",
          "Lojistik, nakliye ve depo",
          "Eğitim ve sağlık hizmetleri",
        ],
      },
      {
        heading: "Mevsimsellik iş arayanı nasıl etkiler?",
        body: [
          "Turizm ağırlıklı ilçelerde ilan sayısı ilkbaharda artar ve sonbaharda azalır. Buna karşılık muhasebe, eğitim ve sağlık gibi alanlarda işe alım yıl boyunca devam eder.",
          "Mevsimsel dalgalanmayı bilmek, başvuru takviminizi planlamanızı kolaylaştırır. Yaz sezonu öncesinde başvurmak, turizm işverenleri için avantaj sağlar.",
        ],
      },
      {
        heading: "Hangi beceriler öne çıkıyor?",
        body: [
          "İşverenlerin ilanlarda en sık istediği nitelikler iletişim becerisi, takım çalışmasına yatkınlık ve temel bilgisayar kullanımıdır. Müşteriyle doğrudan çalışılan rollerde İngilizce bilgisi belirgin bir avantajdır.",
          "Muhasebe ve ofis yönetimi rollerinde muhasebe yazılımlarına (ör. LinaSoft gibi yerel programlar) aşinalık sık aranır. Teknik rollerde mesleki sertifikalar fark yaratır.",
        ],
      },
      {
        heading: "İş arayanlar için pratik sonuç",
        body: [
          "Tek bir sektöre bağlı kalmak yerine, becerilerinizin geçiş yapabileceği komşu alanları da değerlendirin. Örneğin perakende deneyimi, müşteri hizmetleri ve satış destek rollerine de uygundur.",
          "İlanları düzenli takip etmek belirleyicidir: yeni ilanlar hafta içinde yayımlanır ve erken başvuru görünürlüğü artırır.",
        ],
      },
    ],
  },
  {
    slug: "kktc-isverenler-icin-ilan-rehberi",
    title: "İşverenler İçin: KKTC'de Etkili İş İlanı Nasıl Verilir?",
    description:
      "Kuzey Kıbrıs'ta doğru adayı çekmek için ilan metninin nasıl yazılacağını, hangi bilgilerin şart olduğunu ve sık yapılan hataları ele alıyoruz.",
    category: "İşverenler",
    readMinutes: 5,
    published: ARTICLE_PUBLISHED,
    updated: ARTICLE_UPDATED,
    sections: [
      {
        heading: "İlanı net bir başlıkla açın",
        body: [
          "Adaylar ilk olarak başlığa bakar. \"Eleman aranıyor\" gibi genel bir başlık yerine pozisyonu doğrudan yazın: \"Muhasebe Personeli\", \"Mağaza Satış Temsilcisi\", \"İnşaat Teknikeri\".",
          "Arama yapan adaylar pozisyon adını yazdığı için, başlıkta kullanılan kelimeler ilanınızın bulunmasını doğrudan etkiler.",
        ],
      },
      {
        heading: "Şart olan bilgiler",
        body: [
          "Adayın başvurup başvurmayacağına karar vermesi için gereken bilgileri eksiksiz verin. Eksik ilan, uygun adayların başvurmamasına yol açar.",
        ],
        list: [
          "Pozisyonun tam adı",
          "Çalışma yeri (ilçe ve mümkünse bölge)",
          "Çalışma türü ve düzeni (tam zamanlı, hibrit vb.)",
          "Görev ve sorumluluklar",
          "Aranan nitelikler",
          "Başvuru yöntemi ve son tarih (varsa)",
        ],
      },
      {
        heading: "Ücreti belirtmek avantaja dönüşür",
        body: [
          "Ücret aralığını paylaşan ilanlar, genellikle daha nitelikli ve kararlı başvurular alır. Adayların beklentisiyle işverenin bütçesi baştan uyuşmazsa, süreç her iki taraf için de zaman kaybına dönüşür.",
          "Ücreti ilanda belirtmek istemiyorsanız, en azından görüşmede net bir aralık vermeye hazır olun.",
        ],
      },
      {
        heading: "Sık yapılan hatalar",
        body: [
          "Adayların en çok şikayet ettiği noktalar, süreci uzatan ve güveni azaltan davranışlardır.",
        ],
        list: [
          "Başvurulara hiç yanıt vermemek",
          "İlanı güncellemeden aylarca yayında bırakmak",
          "Belirsiz görev tanımı",
          "Aranan nitelikleri abartmak",
          "Başvuru kanalını belirtmemek",
          "Pozisyon dolduğunda ilanı kaldırmamak",
        ],
      },
      {
        heading: "Başvuruları düzenli değerlendirin",
        body: [
          "İlanı yayımladıktan sonra başvuruları düzenli kontrol edin ve kısa sürede dönüş yapın. Hızlı geri bildirim, iyi adayları kaçırmamanızı sağlar.",
          "Pozisyon dolduğunda ilanı kapatmak, adayların boşa başvurmasını önler ve platformun güncel kalmasını sağlar.",
        ],
      },
    ],
  },
  {
    slug: "kktc-yeni-mezun-is-arama",
    title: "Yeni Mezunlar İçin KKTC'de İlk İş Rehberi",
    description:
      "Deneyimi olmayan adayların Kuzey Kıbrıs'ta ilk işlerini bulmak için ne yapması gerektiğini, hangi kapıları çalabileceğini ele alıyoruz.",
    category: "Kariyer İpuçları",
    readMinutes: 5,
    published: ARTICLE_PUBLISHED,
    updated: ARTICLE_UPDATED,
    sections: [
      {
        heading: "Deneyimsiz adayın elindeki avantajlar",
        body: [
          "Deneyim eksikliği bir engel gibi görünse de, işverenlerin bir kısmı tam da bunu arar: öğrenmeye açık, eğitilebilir ve uzun vadeli çalışacak adaylar. Staj ve yarı zamanlı ilanlar bu ihtiyaç için vardır.",
          "Okul dönemindeki projeler, gönüllü çalışmalar, öğrenci kulüpleri ve kısa süreli işler de deneyim sayılır. Bunları özgeçmişinize yazmaktan çekinmeyin.",
        ],
      },
      {
        heading: "İlk başvuruda hangi roller?",
        body: [
          "İlk iş arayanlar için gerçekçi başlangıç noktaları, müşteriyle doğrudan çalışılan ve eğitimle öğrenilebilen roller olur.",
        ],
        list: [
          "Mağaza satış temsilcisi ve kasiyer",
          "Çağrı merkezi ve müşteri hizmetleri",
          "Ofis ve ön büro asistanlığı",
          "Staj programları",
          "Depo ve lojistik destek",
          "Turizm ve yiyecek-içecek servis rolleri",
        ],
      },
      {
        heading: "Özgeçmişi boş bırakmayın",
        body: [
          "Deneyim bölümü kısa olsa bile özgeçmiş boş görünmemelidir. Eğitim, sertifikalar, diller, bilgisayar becerileri ve katıldığınız projeler bu boşluğu doldurur.",
          "Kısa bir \"Hakkımda\" bölümü ekleyerek ne aradığınızı ve ne yapabildiğinizi iki üç cümleyle anlatabilirsiniz.",
        ],
      },
      {
        heading: "Ağınızı kullanın",
        body: [
          "Kuzey Kıbrıs'ta pek çok iş, duyurulmadan önce tanıdık çevresi üzerinden doldurulur. Aileniz, arkadaşlarınız, hocalarınız ve mezun olduğunuz okulun kariyer birimi bu ağın parçasıdır.",
          "İş arıyor olduğunuzu açıkça söylemek, çoğu zaman farkında olmadığınız fırsatların kapısını açar.",
        ],
      },
      {
        heading: "İlk işi bir basamak olarak görün",
        body: [
          "İlk iş, kariyerinizin sonu değil başlangıcıdır. Orada kazandığınız deneyim, referans ve beceriler, bir sonraki pozisyona geçişinizi kolaylaştırır.",
          "Mükemmel işi beklerken hiçbir şeye başvurmamak yerine, öğrenme fırsatı sunan bir pozisyonla başlamak genellikle daha doğru bir yol.",
        ],
      },
    ],
  },
];
