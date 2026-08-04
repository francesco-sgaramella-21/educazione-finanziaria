import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { XMLParser } from "fast-xml-parser";

import { createTrendReport, saveTrendReport } from "./trend-scout.js";
import type { ContentIdeaInput, TrendReport } from "../schemas/content-idea.js";

export const WEB_TREND_SCOUT_NOTICE =
  "Idee generate da fonti istituzionali, news, blog e canali social aggiornati. Le fonti sono linkate; salvo le visualizzazioni pubbliche di YouTube, i punteggi sono stime editoriali.";

export const META_SOCIAL_COVERAGE_NOTICE =
  "Instagram e Facebook richiedono accesso alle API Meta per leggere contenuti e metriche in modo affidabile; senza credenziali non vengono attribuiti dati di engagement.";

const DEFAULT_HISTORY_PATH = "outputs/trend-history.json";
const MAX_HISTORY_ITEMS = 120;
const FEED_ITEM_LIMIT = 10;
const REPORT_ITEM_LIMIT = 12;

type SourceKind = "institutional" | "news" | "blog" | "social";
type SocialPlatform = "youtube" | "instagram" | "facebook";

export type FeedSource = {
  label: string;
  url: string;
  kind: SourceKind;
  platform?: SocialPlatform;
  market?: "italy" | "international";
};

type TrendHistory = {
  updated_at: string;
  sent_item_keys: string[];
};

type FeedItem = {
  key: string;
  sourceLabel: string;
  sourceUrl: string;
  sourceKind: SourceKind;
  platform: SocialPlatform | null;
  market: "italy" | "international";
  title: string;
  link: string;
  summary: string;
  publishedAt: Date | null;
  views: number | null;
  reactions: number | null;
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
    kind: "institutional"
  },
  {
    label: "ISTAT - prezzi",
    url: "https://www.istat.it/tema/prezzi/feed/",
    kind: "institutional"
  },
  {
    label: "Banca Centrale Europea - comunicati",
    url: "https://www.ecb.europa.eu/rss/press.html",
    kind: "institutional",
    market: "international"
  },
  {
    label: "Banca Centrale Europea - statistiche",
    url: "https://www.ecb.europa.eu/rss/statpress.html",
    kind: "institutional",
    market: "international"
  },
  {
    label: "BIS - statistiche e ricerca",
    url: "https://www.bis.org/doclist/all_statistics.rss",
    kind: "institutional",
    market: "international"
  },
  {
    label: "Google News - risparmio e investimenti Italia",
    url: "https://news.google.com/rss/search?q=finanza%20personale%20Italia%20OR%20risparmio%20OR%20investimenti&hl=it&gl=IT&ceid=IT:it",
    kind: "news"
  },
  {
    label: "Google News - BTP tassi mutui",
    url: "https://news.google.com/rss/search?q=BTP%20OR%20tassi%20OR%20mutui%20Italia&hl=it&gl=IT&ceid=IT:it",
    kind: "news"
  },
  {
    label: "Google News - pensione e previdenza",
    url: "https://news.google.com/rss/search?q=pensione%20OR%20previdenza%20complementare%20Italia&hl=it&gl=IT&ceid=IT:it",
    kind: "news"
  },
  {
    label: "Of Dollars And Data - Nick Maggiulli",
    url: "https://ofdollarsanddata.com/feed/",
    kind: "blog",
    market: "international"
  },
  {
    label: "A Wealth of Common Sense - Ben Carlson",
    url: "https://awealthofcommonsense.com/feed/",
    kind: "blog",
    market: "international"
  },
  {
    label: "HumbleDollar",
    url: "https://humbledollar.com/feed/",
    kind: "blog",
    market: "international"
  },
  {
    label: "Affari Miei",
    url: "https://www.affarimiei.biz/feed/",
    kind: "blog"
  },
  {
    label: "YouTube - Mr. RIP",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC-VDfa01El25H9aQzKDNwzQ",
    kind: "social",
    platform: "youtube"
  },
  {
    label: "YouTube - Paolo Coletti",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCan7zXUtAipUspWKeG-_AWQ",
    kind: "social",
    platform: "youtube"
  },
  {
    label: "YouTube - IoInvesto",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCdxW9KZslNPIqlq9AZVZ8_A",
    kind: "social",
    platform: "youtube"
  },
  {
    label: "YouTube - Ben Felix",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCDXTQ8nWmx_EhZ2v-kp7QxA",
    kind: "social",
    platform: "youtube",
    market: "international"
  },
  {
    label: "YouTube - The Plain Bagel",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCFCEuCsyWP0YkP3CZ3Mr01Q",
    kind: "social",
    platform: "youtube",
    market: "international"
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
  const selectedItems = selectBalancedItems(rankedItems, REPORT_ITEM_LIMIT);
  const ideas = selectedItems.map((item, index) =>
    createIdeaFromFeedItem(item, index, generatedAt)
  );
  const report = createTrendReport(ideas, generatedAt);

  return {
    ...report,
    data_notice: createDataNotice(items, selectedItems, history)
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
  const selectedItems = selectBalancedItems(rankedItems, REPORT_ITEM_LIMIT);
  const report = createTrendReport(
    selectedItems.map((item, index) => createIdeaFromFeedItem(item, index, generatedAt)),
    generatedAt
  );

  await saveTrendReport(
    {
      ...report,
      data_notice: createDataNotice(items, selectedItems, history)
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

  return [...byKey.values()].filter(isRelevantFeedItem);
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

function selectBalancedItems(items: FeedItem[], limit: number): FeedItem[] {
  const selected: FeedItem[] = [];
  const selectedKeys = new Set<string>();
  const groups: SourceKind[][] = [["social"], ["blog"], ["institutional", "news"]];
  const minimumPerGroup = Math.min(3, Math.floor(limit / groups.length));

  for (const group of groups) {
    const candidates = items.filter((candidate) => group.includes(candidate.sourceKind));
    const diverse = firstItemPerSource(candidates);
    const diverseKeys = new Set(diverse.map((item) => item.key));
    const prioritized = [
      ...diverse,
      ...candidates.filter((candidate) => !diverseKeys.has(candidate.key))
    ];

    for (const item of prioritized.slice(0, minimumPerGroup)) {
      selected.push(item);
      selectedKeys.add(item.key);
    }
  }

  for (const item of items) {
    if (selected.length >= limit) {
      break;
    }

    if (!selectedKeys.has(item.key)) {
      selected.push(item);
      selectedKeys.add(item.key);
    }
  }

  return selected;
}

function firstItemPerSource(items: FeedItem[]): FeedItem[] {
  const sourceLabels = new Set<string>();

  return items.filter((item) => {
    if (sourceLabels.has(item.sourceLabel)) {
      return false;
    }

    sourceLabels.add(item.sourceLabel);
    return true;
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
    readText(record.description) ||
      readText(record.summary) ||
      readText(record.content) ||
      readNestedText(record, ["media:group", "media:description"])
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
    sourceKind: source.kind,
    platform: source.platform ?? null,
    market: source.market ?? "italy",
    title,
    link,
    summary,
    publishedAt,
    views: readNestedNumber(
      record,
      ["media:group", "media:community", "media:statistics"],
      "@_views"
    ),
    reactions: readNestedNumber(
      record,
      ["media:group", "media:community", "media:starRating"],
      "@_count"
    )
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
  const sourceModifiers = getSourceModifiers(item);

  return {
    id: `${item.sourceKind}-${createStableKey(
      `${item.key}|${generatedAt.toISOString().slice(0, 10)}|${index}`
    ).slice(0, 12)}`,
    title: `${category.titlePrefix}: ${shortenTitle(item.title)}`,
    hook: category.hook,
    angle: `${category.angle} Punto di partenza: "${item.title}".`,
    target_problem: category.targetProblem,
    why_it_could_work: `${category.whyItCouldWork} ${sourceModifiers.editorialReason}`,
    why_now: `La fonte ha pubblicato o aggregato questo aggiornamento il ${readableDate}. ${formatEngagementSnapshot(item)} Va usato come spunto e verificato sul link originale prima del copy.`,
    recommended_format: category.format,
    sources_needed: [
      `${item.sourceLabel}: ${item.link}`,
      `Feed consultato: ${item.sourceUrl}`,
      `Tipo di fonte: ${formatSourceKind(item)}`,
      "Verifica manuale del testo completo prima della pubblicazione"
    ],
    risks: [
      "Non trasformare lo spunto in consulenza finanziaria personalizzata",
      "Distinguere fatti riportati dalla fonte, stime editoriali e assunzioni operative",
      ...(item.sourceKind === "news" ? ["Aprire la fonte originale collegata da Google News"] : []),
      ...(item.sourceKind === "social" || item.sourceKind === "blog"
        ? [
            "Prendere ispirazione dal tema e dalla struttura senza copiare testo, titolo o creativita'"
          ]
        : []),
      ...(item.market === "international"
        ? ["Adattare esempi, fiscalita', previdenza e prodotti al contesto italiano"]
        : [])
    ],
    viral_score: clampScore(category.viral + totalSeed * 0.03 + sourceModifiers.viral),
    utility_score: clampScore(category.utility + totalSeed * 0.04 + sourceModifiers.utility),
    save_score: clampScore(category.save + totalSeed * 0.04 + sourceModifiers.save),
    share_score: clampScore(category.share + totalSeed * 0.03 + sourceModifiers.share),
    comment_score: clampScore(category.comment + totalSeed * 0.03),
    timeliness_score: clampScore(category.timeliness + totalSeed * 0.05),
    substack_score: clampScore(category.substack + totalSeed * 0.04 + sourceModifiers.substack)
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

function isRelevantFeedItem(item: FeedItem): boolean {
  if (item.sourceKind === "blog" || item.sourceKind === "social") {
    return true;
  }

  return containsAny(`${item.title} ${item.summary}`.toLowerCase(), [
    "risparm",
    "invest",
    "budget",
    "prezz",
    "inflazione",
    "consum",
    "energia",
    "salari",
    "redditi",
    "lavoro",
    "occupaz",
    "commercio al dettaglio",
    "btp",
    "titoli di stato",
    "tassi",
    "mutui",
    "deposit",
    "banc",
    "credito",
    "debito",
    "rendiment",
    "obbligaz",
    "mercati",
    "pension",
    "previdenza",
    "fiscal",
    "truff",
    "frode",
    "crypto",
    "etf",
    "portfolio",
    "household",
    "income",
    "wealth",
    "money",
    "retirement"
  ]);
}

function scoreFeedItem(item: FeedItem, now: Date): number {
  const ageDays = item.publishedAt
    ? Math.max(0, (now.getTime() - item.publishedAt.getTime()) / 86_400_000)
    : 12;
  const recency = Math.max(0, 10 - ageDays * 0.8);
  const sourceQuality =
    item.sourceKind === "institutional"
      ? 1.2
      : item.sourceKind === "blog"
        ? 1
        : item.sourceKind === "social"
          ? 0.8
          : 0.6;
  const publicEngagement = scorePublicEngagement(item, ageDays);
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

  return recency + sourceQuality + publicEngagement + relevance;
}

function scorePublicEngagement(item: FeedItem, ageDays: number): number {
  if (item.platform !== "youtube" || item.views === null) {
    return 0;
  }

  const viewsPerDay = item.views / Math.max(1, ageDays);
  return Math.min(2.5, Math.max(0, Math.log10(Math.max(1, viewsPerDay)) - 1));
}

function getSourceModifiers(item: FeedItem) {
  if (item.sourceKind === "social") {
    const engagementBonus =
      item.views === null ? 0 : Math.min(0.8, Math.log10(item.views + 1) * 0.14);

    return {
      viral: 0.6 + engagementBonus,
      utility: 0,
      save: 0.2,
      share: 0.5,
      substack: 0,
      editorialReason:
        "Il tema arriva da un formato social gia' esposto a un pubblico ampio; il segnale aiuta a scegliere l'angolo, non prova che funzionera' sul tuo profilo."
    };
  }

  if (item.sourceKind === "blog") {
    return {
      viral: 0,
      utility: 0.3,
      save: 0.2,
      share: 0,
      substack: 0.7,
      editorialReason:
        "Il formato lungo offre una tesi e un ragionamento utili da adattare al pubblico italiano."
    };
  }

  if (item.sourceKind === "institutional") {
    return {
      viral: 0,
      utility: 0.4,
      save: 0.2,
      share: 0,
      substack: 0.2,
      editorialReason: "La fonte primaria rafforza la verificabilita' del contenuto."
    };
  }

  return {
    viral: 0.1,
    utility: 0,
    save: 0,
    share: 0.1,
    substack: 0.1,
    editorialReason:
      "La copertura giornalistica segnala attenzione sul tema, da confermare sulla fonte originale."
  };
}

function formatEngagementSnapshot(item: FeedItem): string {
  if (item.platform !== "youtube" || item.views === null) {
    return "Non sono disponibili metriche pubbliche affidabili per questo elemento.";
  }

  const reactionText = item.reactions === null ? "" : ` e ${item.reactions} valutazioni pubbliche`;
  return `Il feed YouTube riporta ${item.views} visualizzazioni${reactionText} al momento della scansione.`;
}

function formatSourceKind(item: FeedItem): string {
  if (item.sourceKind === "social") {
    return `social (${item.platform ?? "piattaforma non indicata"})`;
  }

  return item.sourceKind;
}

function createDataNotice(
  items: FeedItem[],
  selectedItems: FeedItem[],
  history: TrendHistory
): string {
  const counts = countBySourceKind(items);
  const unseenSelected = selectedItems.filter(
    (item) => !history.sent_item_keys.includes(item.key)
  ).length;

  return `${WEB_TREND_SCOUT_NOTICE} Item letti: ${items.length} (istituzionali: ${counts.institutional}, news: ${counts.news}, blog: ${counts.blog}, social: ${counts.social}); idee selezionate mai inviate: ${unseenSelected}. ${META_SOCIAL_COVERAGE_NOTICE}`;
}

function countBySourceKind(items: FeedItem[]): Record<SourceKind, number> {
  return items.reduce<Record<SourceKind, number>>(
    (counts, item) => ({ ...counts, [item.sourceKind]: counts[item.sourceKind] + 1 }),
    { institutional: 0, news: 0, blog: 0, social: 0 }
  );
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

function readNestedText(value: unknown, path: string[]): string {
  let current: unknown = value;

  for (const segment of path) {
    if (!isRecord(current)) {
      return "";
    }

    current = current[segment];
  }

  return readText(current);
}

function readNestedNumber(value: unknown, path: string[], attribute: string): number | null {
  let current: unknown = value;

  for (const segment of path) {
    if (!isRecord(current)) {
      return null;
    }

    current = current[segment];
  }

  if (!isRecord(current)) {
    return null;
  }

  const numericValue = Number(current[attribute]);
  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : null;
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
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/g, (match, codePoint: string) => {
      const parsed = Number(codePoint);
      return Number.isInteger(parsed) && parsed >= 0 && parsed <= 0x10ffff
        ? String.fromCodePoint(parsed)
        : match;
    });
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
