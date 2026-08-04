import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { XMLParser } from "fast-xml-parser";

import { createTrendReport, saveTrendReport } from "./trend-scout.js";
import type { ContentIdeaInput, TrendReport } from "../schemas/content-idea.js";

export const WEB_TREND_SCOUT_NOTICE =
  "Idee generate da feed RSS e pagine web aggiornate. Le fonti sono linkate; i punteggi sono stime editoriali, non dati misurati.";

const DEFAULT_HISTORY_PATH = "outputs/trend-history.json";
const MAX_HISTORY_ITEMS = 120;
const FEED_ITEM_LIMIT = 8;

type FeedSource = {
  label: string;
  url: string;
  authority: "institutional" | "news-aggregator";
};

type TrendHistory = {
  updated_at: string;
  sent_item_keys: string[];
};

type FeedItem = {
  key: string;
  sourceLabel: string;
  sourceUrl: string;
  sourceAuthority: FeedSource["authority"];
  title: string;
  link: string;
  summary: string;
  publishedAt: Date | null;
};

type WebTrendScoutOptions = {
  sources?: FeedSource[];
  historyPath?: string;
  generatedAt?: Date;
};

const DEFAULT_FEED_SOURCES: FeedSource[] = [
  {
    label: "ISTAT - ultimi aggiornamenti",
    url: "https://www.istat.it/feed/",
    authority: "institutional"
  },
  {
    label: "ISTAT - prezzi",
    url: "https://www.istat.it/tema/prezzi/feed/",
    authority: "institutional"
  },
  {
    label: "Banca Centrale Europea - comunicati",
    url: "https://www.ecb.europa.eu/rss/press.html",
    authority: "institutional"
  },
  {
    label: "Banca Centrale Europea - statistiche",
    url: "https://www.ecb.europa.eu/rss/statpress.html",
    authority: "institutional"
  },
  {
    label: "BIS - statistiche e ricerca",
    url: "https://www.bis.org/doclist/all_statistics.rss",
    authority: "institutional"
  },
  {
    label: "Google News - risparmio e investimenti Italia",
    url: "https://news.google.com/rss/search?q=finanza%20personale%20Italia%20OR%20risparmio%20OR%20investimenti&hl=it&gl=IT&ceid=IT:it",
    authority: "news-aggregator"
  },
  {
    label: "Google News - BTP tassi mutui",
    url: "https://news.google.com/rss/search?q=BTP%20OR%20tassi%20OR%20mutui%20Italia&hl=it&gl=IT&ceid=IT:it",
    authority: "news-aggregator"
  },
  {
    label: "Google News - pensione e previdenza",
    url: "https://news.google.com/rss/search?q=pensione%20OR%20previdenza%20complementare%20Italia&hl=it&gl=IT&ceid=IT:it",
    authority: "news-aggregator"
  }
];

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true
});

export async function createWebTrendReport(
  options: WebTrendScoutOptions = {}
): Promise<TrendReport> {
  const generatedAt = options.generatedAt ?? new Date();
  const history = await loadTrendHistory(
    options.historyPath ?? process.env.TREND_HISTORY_PATH ?? DEFAULT_HISTORY_PATH
  );
  const items = await fetchFeedItems(options.sources ?? DEFAULT_FEED_SOURCES);
  const rankedItems = rankFeedItems(items, history, generatedAt);
  const ideas = rankedItems
    .slice(0, 8)
    .map((item, index) => createIdeaFromFeedItem(item, index, generatedAt));
  const report = createTrendReport(ideas, generatedAt);

  return {
    ...report,
    data_notice: `${WEB_TREND_SCOUT_NOTICE} Item letti: ${items.length}; item mai inviati prioritizzati: ${
      rankedItems.filter((item) => !history.sent_item_keys.includes(item.key)).length
    }.`
  };
}

export async function saveWebTrendReport(
  outputPath: string,
  historyPath = process.env.TREND_HISTORY_PATH ?? DEFAULT_HISTORY_PATH
): Promise<void> {
  const generatedAt = new Date();
  const history = await loadTrendHistory(historyPath);
  const items = await fetchFeedItems(DEFAULT_FEED_SOURCES);
  const rankedItems = rankFeedItems(items, history, generatedAt);
  const selectedItems = rankedItems.slice(0, 8);
  const report = createTrendReport(
    selectedItems.map((item, index) => createIdeaFromFeedItem(item, index, generatedAt)),
    generatedAt
  );

  await saveTrendReport(
    {
      ...report,
      data_notice: `${WEB_TREND_SCOUT_NOTICE} Item letti: ${items.length}; item mai inviati prioritizzati: ${
        selectedItems.filter((item) => !history.sent_item_keys.includes(item.key)).length
      }.`
    },
    outputPath
  );
  await saveTrendHistory(historyPath, history, selectedItems, generatedAt);
}

export async function fetchFeedItems(sources: FeedSource[]): Promise<FeedItem[]> {
  const settled = await Promise.allSettled(sources.map(fetchFeedSource));
  const items = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const byKey = new Map<string, FeedItem>();

  for (const item of items) {
    if (!byKey.has(item.key)) {
      byKey.set(item.key, item);
    }
  }

  return [...byKey.values()];
}

function rankFeedItems(items: FeedItem[], history: TrendHistory, now: Date): FeedItem[] {
  return [...items].sort((left, right) => {
    const leftFresh = history.sent_item_keys.includes(left.key) ? 0 : 1;
    const rightFresh = history.sent_item_keys.includes(right.key) ? 0 : 1;

    return (
      rightFresh - leftFresh ||
      scoreFeedItem(right, now) - scoreFeedItem(left, now) ||
      left.title.localeCompare(right.title)
    );
  });
}

async function fetchFeedSource(source: FeedSource): Promise<FeedItem[]> {
  const response = await fetch(source.url, {
    headers: {
      accept: "application/rss+xml, application/xml, text/xml"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    return [];
  }

  const xml = await response.text();
  const parsed = xmlParser.parse(xml) as unknown;
  const records = extractFeedRecords(parsed).slice(0, FEED_ITEM_LIMIT);

  return records
    .map((record) => normalizeFeedRecord(record, source))
    .filter((item): item is FeedItem => item !== null);
}

function extractFeedRecords(parsed: unknown): unknown[] {
  if (!isRecord(parsed)) {
    return [];
  }

  const rss = parsed.rss;
  if (isRecord(rss) && isRecord(rss.channel)) {
    return toArray(rss.channel.item);
  }

  const feed = parsed.feed;
  if (isRecord(feed)) {
    return toArray(feed.entry);
  }

  return [];
}

function normalizeFeedRecord(record: unknown, source: FeedSource): FeedItem | null {
  if (!isRecord(record)) {
    return null;
  }

  const title = cleanText(readText(record.title));
  const link = normalizeLink(record.link, source.url);
  const summary = cleanText(
    readText(record.description) || readText(record.summary) || readText(record.content)
  );
  const publishedAt = parseDate(
    readText(record.pubDate) || readText(record.published) || readText(record.updated)
  );

  if (title.length < 8 || link.length === 0) {
    return null;
  }

  return {
    key: createStableKey(`${source.label}|${link}|${title}`),
    sourceLabel: source.label,
    sourceUrl: source.url,
    sourceAuthority: source.authority,
    title,
    link,
    summary,
    publishedAt
  };
}

function createIdeaFromFeedItem(
  item: FeedItem,
  index: number,
  generatedAt: Date
): ContentIdeaInput {
  const category = classifyItem(item);
  const readableDate = item.publishedAt
    ? item.publishedAt.toISOString().slice(0, 10)
    : "data non indicata";
  const totalSeed = scoreFeedItem(item, generatedAt);

  return {
    id: `web-${createStableKey(`${item.key}|${generatedAt.toISOString().slice(0, 10)}|${index}`).slice(0, 12)}`,
    title: `${category.titlePrefix}: ${shortenTitle(item.title)}`,
    hook: category.hook,
    angle: `${category.angle} Punto di partenza: "${item.title}".`,
    target_problem: category.targetProblem,
    why_it_could_work: category.whyItCouldWork,
    why_now: `La fonte ha pubblicato o aggregato questo aggiornamento il ${readableDate}; va usato come spunto e verificato sul link originale prima del copy.`,
    recommended_format: category.format,
    sources_needed: [
      `${item.sourceLabel}: ${item.link}`,
      `Feed consultato: ${item.sourceUrl}`,
      "Verifica manuale del testo completo prima della pubblicazione"
    ],
    risks: [
      "Non trasformare lo spunto in consulenza finanziaria personalizzata",
      "Distinguere fatti riportati dalla fonte, stime editoriali e assunzioni operative",
      ...(item.sourceAuthority === "news-aggregator"
        ? ["Aprire la fonte originale collegata da Google News"]
        : [])
    ],
    viral_score: clampScore(category.viral + totalSeed * 0.03),
    utility_score: clampScore(category.utility + totalSeed * 0.04),
    save_score: clampScore(category.save + totalSeed * 0.04),
    share_score: clampScore(category.share + totalSeed * 0.03),
    comment_score: clampScore(category.comment + totalSeed * 0.03),
    timeliness_score: clampScore(category.timeliness + totalSeed * 0.05),
    substack_score: clampScore(category.substack + totalSeed * 0.04)
  };
}

function classifyItem(item: FeedItem) {
  const text = `${item.title} ${item.summary}`.toLowerCase();

  if (
    containsAny(text, [
      "truff",
      "frode",
      "abusiv",
      "crypto",
      "cripto",
      "bitcoin",
      "ai",
      "intelligenza artificiale"
    ])
  ) {
    return {
      titlePrefix: "Truffe e rischi digitali",
      hook: "Prima di inseguire un rendimento, conviene verificare chi lo sta promettendo.",
      angle:
        "Tradurre la notizia in una checklist per riconoscere segnali d'allarme, fonti ufficiali e passaggi di verifica.",
      targetProblem: "Chi risparmia incontra offerte online prima di sapere come controllarle.",
      whyItCouldWork: "E' un tema pratico, condivisibile e utile anche a chi non investe ancora.",
      format: "Carousel checklist con segnali d'allarme",
      viral: 8.8,
      utility: 9,
      save: 8.8,
      share: 9,
      comment: 8.2,
      timeliness: 8.8,
      substack: 8
    };
  }

  if (containsAny(text, ["prezz", "inflazione", "carrello", "consumo", "energia", "salari"])) {
    return {
      titlePrefix: "Budget e inflazione",
      hook: "Il dato medio e' utile, ma il tuo budget vive di spese concrete.",
      angle:
        "Collegare l'aggiornamento macro alle decisioni quotidiane su budget, priorita' e spese ricorrenti.",
      targetProblem:
        "Molte persone leggono dati economici senza capire come usarli nel bilancio familiare.",
      whyItCouldWork:
        "Favorisce salvataggi e commenti perche parte da spese reali e confrontabili.",
      format: "Carousel con mini-template di budget",
      viral: 7.8,
      utility: 9.3,
      save: 9.1,
      share: 8,
      comment: 7.8,
      timeliness: 9,
      substack: 8.4
    };
  }

  if (
    containsAny(text, [
      "btp",
      "titoli di stato",
      "tassi",
      "mutui",
      "deposit",
      "bce",
      "rendiment",
      "obbligaz"
    ])
  ) {
    return {
      titlePrefix: "Tassi, liquidita' e strumenti",
      hook: "Il rendimento non basta: orizzonte, rischio e liquidabilita' cambiano la decisione.",
      angle:
        "Usare la notizia per confrontare strumenti diversi senza fare raccomandazioni di acquisto.",
      targetProblem: "I risparmiatori confrontano spesso prodotti diversi usando un solo numero.",
      whyItCouldWork: "E' salvabile perche aiuta a costruire una griglia decisionale semplice.",
      format: "Carousel tabellare con criteri di confronto",
      viral: 7.6,
      utility: 9.1,
      save: 9.2,
      share: 7.6,
      comment: 8.3,
      timeliness: 8.7,
      substack: 9
    };
  }

  if (containsAny(text, ["pension", "previdenza", "tfr", "fondi pensione", "lavoratori"])) {
    return {
      titlePrefix: "Previdenza personale",
      hook: "Le decisioni sulla pensione sembrano lontane, ma il tempo pesa molto.",
      angle:
        "Trasformare l'aggiornamento in una guida su adesione, contributi, TFR, costi e orizzonte temporale.",
      targetProblem: "Chi e' giovane tende a rimandare perche il tema sembra distante o tecnico.",
      whyItCouldWork:
        "Unisce educazione evergreen e attualita', con forte potenziale di approfondimento.",
      format: "Carousel guida con glossario",
      viral: 7.4,
      utility: 9,
      save: 8.9,
      share: 7.5,
      comment: 8,
      timeliness: 8.3,
      substack: 9.2
    };
  }

  return {
    titlePrefix: "Educazione finanziaria attuale",
    hook: "Una notizia economica diventa utile quando sai quale domanda farti dopo.",
    angle:
      "Partire dall'aggiornamento per spiegare un concetto di finanza personale con esempi pratici e limiti chiari.",
    targetProblem:
      "Il pubblico vede molte notizie economiche ma fatica a trasformarle in criteri personali.",
    whyItCouldWork: "Permette un contenuto accessibile, autorevole e facilmente salvabile.",
    format: "Carousel spiegazione con esempio pratico",
    viral: 7.2,
    utility: 8.7,
    save: 8.5,
    share: 7.3,
    comment: 7.6,
    timeliness: 8,
    substack: 8.5
  };
}

function scoreFeedItem(item: FeedItem, now: Date): number {
  const ageDays = item.publishedAt
    ? Math.max(0, (now.getTime() - item.publishedAt.getTime()) / 86_400_000)
    : 12;
  const recency = Math.max(0, 10 - ageDays * 0.8);
  const authority = item.sourceAuthority === "institutional" ? 1.2 : 0.6;
  const relevance = containsAny(`${item.title} ${item.summary}`.toLowerCase(), [
    "risparm",
    "invest",
    "prezz",
    "inflazione",
    "btp",
    "tassi",
    "mutui",
    "pension",
    "previdenza",
    "truff",
    "crypto",
    "mercati"
  ])
    ? 1.4
    : 0;

  return recency + authority + relevance;
}

async function loadTrendHistory(path: string): Promise<TrendHistory> {
  try {
    const rawHistory = await readFile(path, "utf8");
    const parsed = JSON.parse(rawHistory) as Partial<TrendHistory>;

    return {
      updated_at:
        typeof parsed.updated_at === "string" ? parsed.updated_at : new Date(0).toISOString(),
      sent_item_keys: Array.isArray(parsed.sent_item_keys)
        ? parsed.sent_item_keys.filter((key): key is string => typeof key === "string")
        : []
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { updated_at: new Date(0).toISOString(), sent_item_keys: [] };
    }

    throw error;
  }
}

async function saveTrendHistory(
  path: string,
  history: TrendHistory,
  selectedItems: FeedItem[],
  generatedAt: Date
): Promise<void> {
  const sentItemKeys = [...selectedItems.map((item) => item.key), ...history.sent_item_keys].slice(
    0,
    MAX_HISTORY_ITEMS
  );

  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify(
      {
        updated_at: generatedAt.toISOString(),
        sent_item_keys: Array.from(new Set(sentItemKeys)).slice(0, MAX_HISTORY_ITEMS)
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

function normalizeLink(value: unknown, fallbackUrl: string): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return normalizeLink(value[0], fallbackUrl);
  }

  if (isRecord(value)) {
    if (typeof value["@_href"] === "string") {
      return value["@_href"];
    }

    if (typeof value["#text"] === "string") {
      return value["#text"];
    }
  }

  return fallbackUrl;
}

function readText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(readText).find((text) => text.length > 0) ?? "";
  }

  if (isRecord(value)) {
    return readText(value["#text"]);
  }

  return "";
}

function cleanText(value: string): string {
  return decodeBasicEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeBasicEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function parseDate(value: string): Date | null {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function shortenTitle(value: string): string {
  return value.length <= 92 ? value : `${value.slice(0, 89).trim()}...`;
}

function containsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function clampScore(value: number): number {
  return Number(Math.min(10, Math.max(0, value)).toFixed(1));
}

function createStableKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  return value === undefined || value === null ? [] : [value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
