import { z } from "zod";

export const scoreSchema = z.number().min(0).max(10);

export const contentIdeaInputSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  hook: z.string().min(1),
  angle: z.string().min(1),
  target_problem: z.string().min(1),
  why_it_could_work: z.string().min(1),
  why_now: z.string().min(1),
  recommended_format: z.string().min(1),
  sources_needed: z.array(z.string().min(1)).min(1),
  risks: z.array(z.string().min(1)).default([]),
  viral_score: scoreSchema,
  utility_score: scoreSchema,
  save_score: scoreSchema,
  share_score: scoreSchema,
  comment_score: scoreSchema,
  timeliness_score: scoreSchema,
  substack_score: scoreSchema
});

export const contentIdeaSchema = contentIdeaInputSchema.extend({
  total_score: scoreSchema
});

export const trendReportSchema = z.object({
  generated_at: z.string().datetime(),
  agent: z.literal("trend-scout"),
  data_notice: z.string().min(1),
  ideas: z.array(contentIdeaSchema)
});

export type ContentIdeaInput = z.infer<typeof contentIdeaInputSchema>;
export type ContentIdea = z.infer<typeof contentIdeaSchema>;
export type TrendReport = z.infer<typeof trendReportSchema>;

export function validateContentIdea(input: unknown): ContentIdea {
  return contentIdeaSchema.parse(input);
}

export function validateContentIdeaInput(input: unknown): ContentIdeaInput {
  return contentIdeaInputSchema.parse(input);
}
