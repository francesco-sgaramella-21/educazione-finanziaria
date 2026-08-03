import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createDailyDigestFromReportPath,
  formatDailyDigestForTelegram,
  saveDailyDigest,
  sendTelegramMessage
} from "../agents/daily-telegram-digest.js";

await loadDotEnv(resolve(".env"));

const TREND_REPORT_PATH = resolve(envOrDefault("TREND_REPORT_PATH", "outputs/trend-report.json"));
const DIGEST_OUTPUT_PATH = resolve(
  envOrDefault("DAILY_DIGEST_OUTPUT_PATH", `outputs/daily-telegram/digest-${todaySlug()}.json`)
);
const DRY_RUN = process.argv.includes("--dry-run") || process.env.DAILY_DIGEST_DRY_RUN === "1";

const digest = await createDailyDigestFromReportPath(TREND_REPORT_PATH);
const message = formatDailyDigestForTelegram(digest);

await saveDailyDigest(digest, DIGEST_OUTPUT_PATH);

console.log("Daily Telegram Digest");
console.log(digest.source_notice);
console.log(`Digest salvato: ${DIGEST_OUTPUT_PATH}`);

if (DRY_RUN) {
  console.log("");
  console.log(message);
} else {
  await sendTelegramMessage(
    {
      botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
      chatId: process.env.TELEGRAM_CHAT_ID ?? ""
    },
    message
  );
  console.log("Messaggio Telegram inviato.");
}

function todaySlug(): string {
  return new Date().toISOString().slice(0, 10);
}

function envOrDefault(key: string, defaultValue: string): string {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : defaultValue;
}

async function loadDotEnv(path: string): Promise<void> {
  let file: string;

  try {
    file = await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  for (const line of file.split("\n")) {
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key.length > 0 && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
