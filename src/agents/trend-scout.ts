import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  type ContentIdea,
  type ContentIdeaInput,
  type TrendReport,
  contentIdeaInputSchema,
  trendReportSchema
} from "../schemas/content-idea.js";

export const TREND_SCOUT_DATA_NOTICE =
  "Dati dimostrativi simulati: le idee non derivano da una ricerca aggiornata, da internet o da API OpenAI.";

const SCORE_WEIGHTS = {
  utility_score: 0.25,
  save_score: 0.2,
  share_score: 0.15,
  viral_score: 0.15,
  comment_score: 0.1,
  timeliness_score: 0.1,
  substack_score: 0.05
} as const;

export function calculateTotalScore(idea: ContentIdeaInput): number {
  const total =
    idea.utility_score * SCORE_WEIGHTS.utility_score +
    idea.save_score * SCORE_WEIGHTS.save_score +
    idea.share_score * SCORE_WEIGHTS.share_score +
    idea.viral_score * SCORE_WEIGHTS.viral_score +
    idea.comment_score * SCORE_WEIGHTS.comment_score +
    idea.timeliness_score * SCORE_WEIGHTS.timeliness_score +
    idea.substack_score * SCORE_WEIGHTS.substack_score;

  return Number(total.toFixed(2));
}

export function scoreContentIdea(input: unknown): ContentIdea {
  const idea = contentIdeaInputSchema.parse(input);

  return {
    ...idea,
    total_score: calculateTotalScore(idea)
  };
}

export function rankContentIdeas(inputs: unknown[]): ContentIdea[] {
  return inputs
    .map(scoreContentIdea)
    .sort((left, right) => right.total_score - left.total_score || left.id.localeCompare(right.id));
}

export function createTrendReport(inputs: unknown[], generatedAt = new Date()): TrendReport {
  return trendReportSchema.parse({
    generated_at: generatedAt.toISOString(),
    agent: "trend-scout",
    data_notice: TREND_SCOUT_DATA_NOTICE,
    ideas: rankContentIdeas(inputs)
  });
}

export async function saveTrendReport(report: TrendReport, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
