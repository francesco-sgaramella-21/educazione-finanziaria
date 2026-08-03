import { readFile } from "node:fs/promises";

import { type TrendReport, trendReportSchema } from "../schemas/content-idea.js";

export async function loadTrendReport(inputPath: string): Promise<TrendReport> {
  let rawReport: string;

  try {
    rawReport = await readFile(inputPath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(`Trend report mancante: ${inputPath}. Esegui prima npm run trends:web.`, {
        cause: error
      });
    }

    throw error;
  }

  return trendReportSchema.parse(JSON.parse(rawReport) as unknown);
}
