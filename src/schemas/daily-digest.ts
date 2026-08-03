import { z } from "zod";

import { contentIdeaSchema } from "./content-idea.js";

export const digestStatusSchema = z.enum(["draft"]);

export const substackArticleIdeaSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  hook: z.string().min(1),
  thesis: z.string().min(1),
  why_now: z.string().min(1),
  suggested_structure: z.array(z.string().min(1)).min(3),
  sources_needed: z.array(z.string().min(1)).min(1),
  risks: z.array(z.string().min(1)).default([]),
  score: z.number().min(0).max(10)
});

export const dailyDigestSchema = z.object({
  generated_at: z.string().datetime(),
  agent: z.literal("daily-telegram-digest"),
  status: digestStatusSchema,
  source_notice: z.string().min(1),
  approval_notice: z.string().min(1),
  carousel_ideas: z.array(contentIdeaSchema).length(3),
  substack_article_ideas: z.array(substackArticleIdeaSchema).length(3)
});

export type SubstackArticleIdea = z.infer<typeof substackArticleIdeaSchema>;
export type DailyDigest = z.infer<typeof dailyDigestSchema>;
