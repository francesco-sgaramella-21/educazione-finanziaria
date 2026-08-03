import { createTrendReport, saveTrendReport } from "./trend-scout.js";
import type { ContentIdeaInput } from "../schemas/content-idea.js";

export const WEB_TREND_SCOUT_NOTICE =
  "Idee generate da una lista curata di fonti web istituzionali verificabili. I punteggi sono stime editoriali, non dati misurati.";

type WebSource = {
  label: string;
  url: string;
};

type WebTrendIdea = ContentIdeaInput & {
  web_sources: WebSource[];
};

const WEB_TREND_IDEAS: WebTrendIdea[] = [
  {
    id: "web-idea-ai-frodi",
    title: "Truffe finanziarie con AI: la checklist prima di cliccare",
    hook: "Se un volto famoso ti promette rendimenti facili, il primo investimento e' fermarti.",
    angle:
      "Spiegare come riconoscere siti clonati, profili falsi, contenuti generati con AI e operatori non autorizzati.",
    target_problem:
      "Molti risparmiatori incontrano offerte finanziarie online prima di sapere come verificarle.",
    why_it_could_work:
      "Tema molto condivisibile perche protegge denaro e dati personali, con una checklist pratica da salvare.",
    why_now:
      "Consob segnala periodicamente rischi legati a intermediari abusivi, cripto-attivita' e comunicazioni digitali ingannevoli.",
    recommended_format: "Carousel checklist con esempi di segnali d'allarme",
    sources_needed: [
      "Consob, avvisi e comunicazioni per investitori retail",
      "Consob, strumenti per verificare offerte sospette"
    ],
    risks: ["Non nominare singoli soggetti non verificati", "Evitare toni allarmistici"],
    viral_score: 9.1,
    utility_score: 8.8,
    save_score: 8.5,
    share_score: 9.2,
    comment_score: 8.3,
    timeliness_score: 9,
    substack_score: 8,
    web_sources: [
      {
        label: "Consob comunicati",
        url: "https://www.consob.it/web/consob-and-its-activities/press-releases-detail"
      },
      {
        label: "Consob investitori retail",
        url: "https://www.consob.it/web/consob/are-you-a-retail-investor-"
      }
    ]
  },
  {
    id: "web-idea-inflazione-personale",
    title: "Inflazione personale: perche il tuo carrello puo' raccontare un'altra storia",
    hook: "Il dato medio dice una cosa. Le tue spese ricorrenti possono dirne un'altra.",
    angle:
      "Trasformare l'inflazione ufficiale in un esercizio pratico su energia, alimentari, trasporti e spese frequenti.",
    target_problem:
      "Le persone leggono il dato ISTAT ma faticano a collegarlo al proprio budget mensile.",
    why_it_could_work:
      "E' concreto, salvabile e permette agli utenti di commentare con la propria esperienza di spesa.",
    why_now:
      "ISTAT pubblica aggiornamenti mensili sui prezzi al consumo, utili per agganciare il tema al budget familiare.",
    recommended_format: "Reel con mini-template in caption",
    sources_needed: ["ISTAT, prezzi al consumo", "Banca d'Italia, indicatori economia italiana"],
    risks: [
      "Chiarire che il calcolo personale e' una stima",
      "Non confondere inflazione ufficiale con rincaro percepito"
    ],
    viral_score: 8.2,
    utility_score: 9.3,
    save_score: 9.2,
    share_score: 8.1,
    comment_score: 7.6,
    timeliness_score: 9.4,
    substack_score: 8.5,
    web_sources: [
      { label: "ISTAT prezzi al consumo", url: "https://www.istat.it/tema/prezzi/" },
      { label: "Banca d'Italia", url: "https://www.bancaditalia.it/" }
    ]
  },
  {
    id: "web-idea-liquidita",
    title: "BTP, ETF monetari e conto deposito: stesso obiettivo, rischi diversi",
    hook: "Quando cerchi rendimento sulla liquidita', il confronto giusto non parte solo dal tasso.",
    angle:
      "Mettere in tabella orizzonte, garanzie, liquidabilita', costi, fiscalita' e rischio prezzo.",
    target_problem:
      "Molti risparmiatori confrontano strumenti diversi usando un solo numero: il rendimento promesso o atteso.",
    why_it_could_work:
      "Ha alto valore di salvataggio per chi deve parcheggiare liquidita' senza trasformare il post in consulenza personalizzata.",
    why_now:
      "Le decisioni sulla liquidita' restano legate a tassi, emissioni del Tesoro e condizioni bancarie aggiornate.",
    recommended_format: "Carousel con matrice decisionale",
    sources_needed: [
      "Banca d'Italia, tassi e materiali educativi",
      "MEF/Dipartimento del Tesoro per titoli di Stato",
      "Fogli informativi degli intermediari se si citano prodotti specifici"
    ],
    risks: [
      "Non fare raccomandazioni di acquisto",
      "Verificare rendimenti e fiscalita' il giorno della pubblicazione"
    ],
    viral_score: 7.7,
    utility_score: 9.2,
    save_score: 9.1,
    share_score: 7.6,
    comment_score: 8.4,
    timeliness_score: 8.8,
    substack_score: 9,
    web_sources: [
      { label: "Banca d'Italia", url: "https://www.bancaditalia.it/" },
      { label: "MEF Dipartimento del Tesoro", url: "https://www.dt.mef.gov.it/" }
    ]
  },
  {
    id: "web-idea-previdenza",
    title: "Fondo pensione: perche i giovani stanno iniziando a entrarci",
    hook: "La previdenza complementare sembra lontana finche non guardi il tempo come alleato.",
    angle:
      "Spiegare adesione, TFR, contributo datoriale, orizzonte lungo e scelta della linea d'investimento.",
    target_problem:
      "Molti under 35 rimandano perche vedono la pensione come un tema troppo distante o complicato.",
    why_it_could_work:
      "Unisce attualita' e educazione evergreen, con forte potenziale di salvataggio e approfondimento.",
    why_now: "COVIP aggiorna periodicamente dati e relazioni sulla previdenza complementare.",
    recommended_format: "Carousel guida base con glossario",
    sources_needed: ["COVIP, relazioni annuali", "COVIP, statistiche fondi pensione"],
    risks: [
      "Non presentare rendimenti passati come promesse future",
      "Distinguere fondo negoziale, fondo aperto e PIP"
    ],
    viral_score: 7.6,
    utility_score: 9,
    save_score: 8.9,
    share_score: 7.4,
    comment_score: 8,
    timeliness_score: 8.5,
    substack_score: 9.1,
    web_sources: [
      {
        label: "COVIP relazioni annuali",
        url: "https://www.covip.it/la-covip-e-la-sua-attivita/pubblicazioni-statistiche/relazioni-annuali"
      }
    ]
  }
];

export async function createWebTrendReport(generatedAt = new Date()) {
  const ideas = await Promise.all(WEB_TREND_IDEAS.map(attachVerifiedSources));
  const report = createTrendReport(ideas, generatedAt);

  return {
    ...report,
    data_notice: WEB_TREND_SCOUT_NOTICE
  };
}

export async function saveWebTrendReport(outputPath: string): Promise<void> {
  await saveTrendReport(await createWebTrendReport(), outputPath);
}

async function attachVerifiedSources(idea: WebTrendIdea): Promise<ContentIdeaInput> {
  const verifiedSources = await Promise.all(
    idea.web_sources.map(async (source) => {
      const reachable = await isReachable(source.url);
      return `${source.label}: ${source.url}${reachable ? "" : " (da verificare manualmente: fonte non raggiunta al momento del controllo)"}`;
    })
  );

  return {
    id: idea.id,
    title: idea.title,
    hook: idea.hook,
    angle: idea.angle,
    target_problem: idea.target_problem,
    why_it_could_work: idea.why_it_could_work,
    why_now: idea.why_now,
    recommended_format: idea.recommended_format,
    sources_needed: Array.from(new Set([...verifiedSources, ...idea.sources_needed])),
    risks: idea.risks,
    viral_score: idea.viral_score,
    utility_score: idea.utility_score,
    save_score: idea.save_score,
    share_score: idea.share_score,
    comment_score: idea.comment_score,
    timeliness_score: idea.timeliness_score,
    substack_score: idea.substack_score
  };
}

async function isReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow"
    });

    return response.ok;
  } catch {
    return false;
  }
}
