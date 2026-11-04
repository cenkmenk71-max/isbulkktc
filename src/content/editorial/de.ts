import { ARTICLE_PUBLISHED, ARTICLE_UPDATED, type Article } from "./types";

export const deArticles: readonly Article[] = [
  {
    slug: "arbeitsmarkt-nordzypern-ueberblick",
    title: "Der Arbeitsmarkt in Nordzypern: Welche Branchen stellen ein?",
    description:
      "Welche Branchen in Nordzypern regelmäßig einstellen und auf welche Bereiche sich Arbeitssuchende zuerst konzentrieren sollten.",
    category: "Arbeitsmarkt",
    readMinutes: 5,
    published: ARTICLE_PUBLISHED,
    updated: ARTICLE_UPDATED,
    sections: [
      {
        heading: "Wo die Einstellungen stattfinden",
        body: [
          "Die Wirtschaft Nordzyperns ruht überwiegend auf Dienstleistungen, Tourismus, Bau und Einzelhandel. Diese vier Bereiche erzeugen die Arbeitgebergruppen, die man auf einer Stellenbörse am häufigsten sieht.",
          "Tourismus und Gastgewerbe stellen während der Saison laufend ein, besonders rund um Kyrenia und Trikomo. Bau und Baustoffe konzentrieren sich auf Nikosia und Famagusta. Einzelhandel gibt es in jedem Bezirk.",
        ],
        list: [
          "Tourismus, Hotels und Gastronomie",
          "Bau, Baustoffe und technischer Service",
          "Einzelhandel, Verkauf und Ladenfläche",
          "Buchhaltung, Finanzen und Büroverwaltung",
          "Logistik, Transport und Lager",
          "Bildung und Gesundheitswesen",
        ],
      },
      {
        heading: "Wie die Saison Arbeitssuchende betrifft",
        body: [
          "In tourismuslastigen Bezirken steigt die Zahl der Anzeigen im Frühjahr und sinkt im Herbst. Buchhaltung, Bildung und Gesundheitswesen stellen das ganze Jahr ein.",
          "Die Saison zu kennen hilft bei der Planung, wann Sie sich bewerben. Vor der Sommersaison zu bewerben ist bei Tourismusbetrieben ein Vorteil.",
        ],
      },
      {
        heading: "Welche Fähigkeiten auffallen",
        body: [
          "Am häufigsten gefragt sind Kommunikation, Teamfähigkeit und grundlegende Computerkenntnisse. In kundennahen Rollen ist Englisch ein klarer Vorteil.",
          "Buchhaltungs- und Bürorollen verlangen oft Kenntnisse lokaler Buchhaltungssoftware. Technische Rollen belohnen Berufszertifikate.",
        ],
      },
      {
        heading: "Was das für Arbeitssuchende bedeutet",
        body: [
          "Statt sich auf eine Branche festzulegen, sollten Sie benachbarte Bereiche prüfen, in die Ihre Fähigkeiten passen. Einzelhandelserfahrung eignet sich zum Beispiel auch für Kundenservice und Vertriebsunterstützung.",
          "Anzeigen konsequent zu verfolgen ist entscheidend: Neue Stellen erscheinen über die Woche, und eine frühe Bewerbung erhöht Ihre Sichtbarkeit.",
        ],
      },
    ],
  },
  {
    slug: "stellenanzeige-richtig-schreiben-nordzypern",
    title: "Für Arbeitgeber: Wie man in Nordzypern eine wirksame Anzeige schreibt",
    description:
      "Wie eine Anzeige geschrieben wird, die die richtigen Kandidaten anzieht, welche Angaben unverzichtbar sind und welche Fehler man vermeidet.",
    category: "Arbeitgeber",
    readMinutes: 5,
    published: ARTICLE_PUBLISHED,
    updated: ARTICLE_UPDATED,
    sections: [
      {
        heading: "Beginnen Sie mit einem klaren Titel",
        body: [
          "Kandidaten lesen zuerst den Titel. Statt eines allgemeinen \"Personal gesucht\" nennen Sie die Position direkt: \"Buchhalter\", \"Verkaufsmitarbeiter\", \"Bautechniker\".",
          "Da Kandidaten nach Berufsbezeichnung suchen, bestimmen die Worte im Titel unmittelbar, ob Ihre Anzeige gefunden wird.",
        ],
      },
      {
        heading: "Die unverzichtbaren Angaben",
        body: [
          "Geben Sie die Informationen, die ein Kandidat braucht, um über eine Bewerbung zu entscheiden. Eine unvollständige Anzeige ist der Grund, warum geeignete Personen nicht schreiben.",
        ],
        list: [
          "Die vollständige Positionsbezeichnung",
          "Der Arbeitsort (Bezirk und wenn möglich das Gebiet)",
          "Beschäftigungsart und Arbeitsform",
          "Aufgaben und Verantwortlichkeiten",
          "Die Anforderungen",
          "Bewerbungsweg und eventuelle Frist",
        ],
      },
      {
        heading: "Das Gehalt zu nennen zahlt sich aus",
        body: [
          "Anzeigen mit Gehaltsspanne erhalten in der Regel besser qualifizierte und entschlossenere Bewerbungen. Passen Erwartung und Budget nicht zusammen, kostet das beide Seiten Zeit.",
          "Wenn Sie keine Zahl nennen möchten, seien Sie zumindest im Gespräch zu einer klaren Spanne bereit.",
        ],
      },
      {
        heading: "Häufige Fehler",
        body: [
          "Die häufigsten Beschwerden betreffen Punkte, die das Verfahren in die Länge ziehen und Vertrauen kosten.",
        ],
        list: [
          "Auf Bewerbungen nie antworten",
          "Eine Anzeige monatelang ohne Aktualisierung online lassen",
          "Eine vage Aufgabenbeschreibung",
          "Die Anforderungen übertreiben",
          "Den Bewerbungsweg nicht nennen",
          "Die Anzeige nach der Besetzung nicht schließen",
        ],
      },
      {
        heading: "Bewerbungen regelmäßig prüfen",
        body: [
          "Prüfen Sie nach der Veröffentlichung regelmäßig die Bewerbungen und antworten Sie schnell. Eine schnelle Rückmeldung verhindert, dass Sie gute Kandidaten verlieren.",
          "Die Anzeige nach der Besetzung zu schließen verhindert vergebliche Bewerbungen und hält die Plattform aktuell.",
        ],
      },
    ],
  },
  {
    slug: "erster-job-ratgeber-absolventen",
    title: "Ratgeber für Absolventen: Der erste Job in Nordzypern",
    description:
      "Was Kandidaten ohne Erfahrung tun sollten, um in Nordzypern eine erste Stelle zu finden, und an welche Türen sie klopfen können.",
    category: "Karrieretipps",
    readMinutes: 5,
    published: ARTICLE_PUBLISHED,
    updated: ARTICLE_UPDATED,
    sections: [
      {
        heading: "Die Vorteile ohne Berufserfahrung",
        body: [
          "Fehlende Erfahrung wirkt wie ein Hindernis, doch manche Arbeitgeber suchen genau das: jemanden, der lernbereit und einarbeitbar ist und bleibt. Praktikums- und Teilzeitstellen gibt es für diesen Bedarf.",
          "Projekte aus dem Studium, Freiwilligenarbeit, Studentenvereine und kurze Jobs zählen als Erfahrung. Schreiben Sie sie in den Lebenslauf.",
        ],
      },
      {
        heading: "Welche Rollen zuerst",
        body: [
          "Realistische Einstiegspunkte für einen ersten Job sind kundennahe Rollen, die man am Arbeitsplatz lernt.",
        ],
        list: [
          "Verkaufsmitarbeiter und Kassierer",
          "Callcenter und Kundenservice",
          "Büro- und Empfangsassistenz",
          "Praktikumsprogramme",
          "Lager- und Logistikunterstützung",
          "Tourismus und Gastronomie",
        ],
      },
      {
        heading: "Lassen Sie den Lebenslauf nicht leer",
        body: [
          "Auch wenn der Erfahrungsabschnitt kurz ist, sollte der Lebenslauf nicht leer wirken. Ausbildung, Zertifikate, Sprachen, Computerkenntnisse und Projekte füllen diese Lücke.",
          "Ein kurzer Abschnitt \"Über mich\" sagt in zwei oder drei Zeilen, was Sie suchen und was Sie können.",
        ],
      },
      {
        heading: "Nutzen Sie Ihr Netzwerk",
        body: [
          "In Nordzypern werden viele Stellen über ein bekanntes Umfeld besetzt, bevor sie ausgeschrieben werden. Familie, Freunde, Dozenten und die Karrierestelle Ihrer Schule gehören dazu.",
          "Offen zu sagen, dass Sie Arbeit suchen, öffnet oft Türen, die Sie nicht kannten.",
        ],
      },
      {
        heading: "Der erste Job ist eine Stufe",
        body: [
          "Der erste Job ist der Anfang einer Karriere, nicht das Ende. Erfahrung, Referenzen und Fähigkeiten von dort erleichtern den Wechsel zur nächsten Rolle.",
          "Statt auf den perfekten Job zu warten und sich auf nichts zu bewerben, ist ein Job, der Ihnen etwas beibringt, meist der bessere Weg.",
        ],
      },
    ],
  },
];
