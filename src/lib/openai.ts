import OpenAI from "openai";
import { wrapOpenAI } from "langsmith/wrappers/openai";

/**
 * Single OpenAI client for the whole app, wrapped once for LangSmith tracing.
 *
 * wrapOpenAI auto-logs every call when LANGSMITH_TRACING=true — no per-call
 * wrapper needed. It patches `responses.create` / `.parse` / `.stream` (what the
 * agent and the eval judge use) and leaves `embeddings` untouched but working,
 * so embedding calls pass through untraced.
 *
 * Instantiation is lazy on purpose: importing this module must not throw when no
 * key is configured, so /api/chat can return a clean error instead of the route
 * failing to load.
 */
const DEFAULT_PROJECT = "restaurant-rag";

let client: ReturnType<typeof wrapOpenAI<OpenAI>> | null = null;

export function getOpenAI() {
  if (!client) {
    client = wrapOpenAI(
      new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL,
      }),
      { project_name: process.env.LANGSMITH_PROJECT || DEFAULT_PROJECT },
    );
  }
  return client;
}
