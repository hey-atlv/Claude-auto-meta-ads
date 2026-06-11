export type AiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

type DailyUsage = {
  day: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requests: number;
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const readNumberEnv = (name: string, fallback: number) => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

class DailyTokenManager {
  private usage: DailyUsage = {
    day: todayKey(),
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    requests: 0
  };

  private rotateIfNeeded() {
    const day = todayKey();
    if (this.usage.day !== day) {
      this.usage = { day, inputTokens: 0, outputTokens: 0, totalTokens: 0, requests: 0 };
    }
  }

  getBudget() {
    return readNumberEnv('AI_TOKEN_BUDGET_PER_DAY', 1_000_000);
  }

  getWarnThresholdPercent() {
    return readNumberEnv('AI_WARN_THRESHOLD_PERCENT', 80);
  }

  canSpend(estimatedTokens: number) {
    this.rotateIfNeeded();
    return this.usage.totalTokens + estimatedTokens <= this.getBudget();
  }

  assertCanSpend(estimatedTokens: number) {
    if (!this.canSpend(estimatedTokens)) {
      throw new Error(`AI token budget exceeded for ${todayKey()}. Estimated ${estimatedTokens} tokens would exceed daily budget ${this.getBudget()}.`);
    }
  }

  record(usage: AiUsage) {
    this.rotateIfNeeded();
    const inputTokens = usage.inputTokens || 0;
    const outputTokens = usage.outputTokens || 0;
    const totalTokens = usage.totalTokens || inputTokens + outputTokens;

    this.usage.inputTokens += inputTokens;
    this.usage.outputTokens += outputTokens;
    this.usage.totalTokens += totalTokens;
    this.usage.requests += 1;
  }

  getStats() {
    this.rotateIfNeeded();
    const budget = this.getBudget();
    const usedPercent = budget > 0 ? Math.round((this.usage.totalTokens / budget) * 10000) / 100 : 0;
    return {
      ...this.usage,
      budget,
      usedPercent,
      warnThresholdPercent: this.getWarnThresholdPercent(),
      warning: usedPercent >= this.getWarnThresholdPercent()
    };
  }
}

export const tokenManager = new DailyTokenManager();

export function getAiRuntimeConfig() {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    '';

  return {
    enabled: process.env.ETL_AI_NORMALIZE_ENABLED === 'true' || process.env.AI_NORMALIZE_ENABLED === 'true',
    apiKey,
    hasApiKey: apiKey.length > 0,
    model: process.env.GOOGLE_GEMINI_MODEL || 'gemini-2.5-flash',
    maxOutputTokens: readNumberEnv('AI_MAX_OUTPUT_TOKENS', readNumberEnv('AI_MAX_TOKENS', 4096)),
    maxRecordsPerRequest: readNumberEnv('AI_NORMALIZE_BATCH_SIZE', 25),
    maxTokensPerRequest: readNumberEnv('AI_MAX_TOKENS_PER_REQUEST', 8000)
  };
}
