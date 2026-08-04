import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { loadTrendReport } from "./editorial-director.js";
import { type ContentIdea, type TrendReport, contentIdeaSchema } from "../schemas/content-idea.js";
import {
  type DailyDigest,
  type SubstackArticleIdea,
  dailyDigestSchema
} from "../schemas/daily-digest.js";

export const DAILY_DIGEST_SOURCE_NOTICE =
  "Digest generato da un trend report validato. Se il report deriva da ricerca web, usare le fonti indicate prima di sviluppare il copy.";

export const DAILY_DIGEST_APPROVAL_NOTICE =
  "Idee in stato draft: non generano immagini, non approvano copy e non pubblicano contenuti automaticamente.";

export type TelegramConfig = {
  botToken: string;
  chatId: string;
};

export async function createDailyDigestFromReportPath(
  inputPath: string,
  generatedAt = new Date()
): Promise<DailyDigest> {
  const report = await loadTrendReport(inputPath);
  return createDailyDigest(report, generatedAt);
}

export function createDailyDigest(report: TrendReport, generatedAt = new Date()): DailyDigest {
  const rankedIdeas = report.ideas
    .map((idea) => contentIdeaSchema.parse(idea))
    .sort((left, right) => right.total_score - left.total_score || left.id.localeCompare(right.id));

  const carouselIdeas = selectIdeasWithPreferredSources(rankedIdeas, ["social-"], 3);
  const articleIdeas = selectIdeasWithPreferredSources(
    [...rankedIdeas].sort(
      (left, right) =>
        right.substack_score - left.substack_score ||
        right.total_score - left.total_score ||
        left.id.localeCompare(right.id)
    ),
    ["blog-"],
    3
  ).map(createSubstackArticleIdea);

  return dailyDigestSchema.parse({
    generated_at: generatedAt.toISOString(),
    agent: "daily-telegram-digest",
    status: "draft",
    source_notice:
      report.data_notice.includes("ricerca web") || report.data_notice.includes("fonti")
        ? report.data_notice
        : DAILY_DIGEST_SOURCE_NOTICE,
    approval_notice: DAILY_DIGEST_APPROVAL_NOTICE,
    carousel_ideas: carouselIdeas,
    substack_article_ideas: articleIdeas
  });
}

function selectIdeasWithPreferredSources(
  ideas: ContentIdea[],
  preferredIdPrefixes: string[],
  limit: number
): ContentIdea[] {
  const selected: ContentIdea[] = [];
  const selectedIds = new Set<string>();

  for (const prefix of preferredIdPrefixes) {
    const preferred = ideas.find((idea) => idea.id.startsWith(prefix) && !selectedIds.has(idea.id));

    if (preferred) {
      selected.push(preferred);
      selectedIds.add(preferred.id);
    }
  }

  for (const idea of ideas) {
    if (selected.length >= limit) {
      break;
    }

    if (!selectedIds.has(idea.id)) {
      selected.push(idea);
      selectedIds.add(idea.id);
    }
  }

  return selected;
}

export function createSubstackArticleIdea(idea: ContentIdea): SubstackArticleIdea {
  return {
    id: `substack-${idea.id}`,
    title: `${idea.title}: guida lunga con fonti e casi pratici`,
    hook: idea.hook,
    thesis: `Il punto centrale da sviluppare e' questo: ${idea.angle}`,
    why_now: idea.why_now,
    suggested_structure: [
      `Contesto: ${idea.target_problem}`,
      `Tesi: ${idea.angle}`,
      "Esempi pratici e limiti: distinguere fatti, stime e assunzioni",
      "Checklist finale con fonti da verificare prima della pubblicazione"
    ],
    sources_needed: idea.sources_needed,
    risks: idea.risks,
    score: idea.substack_score
  };
}

export function formatDailyDigestForTelegram(digest: DailyDigest): string {
  const lines = ["Buongiorno. Idee editoriali per oggi", "", "3 idee carosello"];

  for (const [index, idea] of digest.carousel_ideas.entries()) {
    lines.push(
      "",
      `${index + 1}. ${idea.title} (${idea.total_score}/10)`,
      `Hook: ${idea.hook}`,
      `Formato: ${idea.recommended_format}`,
      `Fonti: ${idea.sources_needed.join("; ")}`
    );
  }

  lines.push("", "3 idee Substack");

  for (const [index, idea] of digest.substack_article_ideas.entries()) {
    lines.push(
      "",
      `${index + 1}. ${idea.title} (${idea.score}/10)`,
      `Tesi: ${idea.thesis}`,
      `Struttura: ${idea.suggested_structure.slice(0, 3).join(" | ")}`
    );
  }

  lines.push("", digest.approval_notice);

  return lines.join("\n").slice(0, 4096);
}

export async function saveDailyDigest(digest: DailyDigest, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(digest, null, 2)}\n`, "utf8");
}

export async function sendTelegramMessage(config: TelegramConfig, text: string): Promise<void> {
  if (config.botToken.trim().length === 0) {
    throw new Error("TELEGRAM_BOT_TOKEN mancante.");
  }

  if (config.chatId.trim().length === 0) {
    throw new Error("TELEGRAM_CHAT_ID mancante.");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(config.botToken)}/sendMessage`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        disable_web_page_preview: true
      })
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Invio Telegram fallito (${response.status}): ${body}`);
  }
}
