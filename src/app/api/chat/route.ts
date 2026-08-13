import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgent } from "@/lib/agent";
import { getLogger } from "@/lib/logger";
import { findNeighborhoodInTurn, hadEmptyResult } from "@/lib/crawl-offer";
import { startCrawlIfEligible } from "@/lib/crawl-trigger";

const log = getLogger("api/chat");

const ChatRequestSchema = z.object({
  message: z.string(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .default([]),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    log.warn("request body was not valid JSON", {
      reason: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    log.warn("rejected malformed chat request", { reason: parsed.error.message });
    return NextResponse.json(
      { error: "Invalid request", detail: parsed.error.message },
      { status: 400 },
    );
  }

  const message = parsed.data.message.trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const started = Date.now();
   try {
    const result = await runAgent(message, parsed.data.history);
    log.info("chat request answered", {
      ms: Date.now() - started,
      toolCalls: result.toolCalls.map(tool => tool.name).join(", "),
    });

    const neighborhood = findNeighborhoodInTurn(message, result.toolCalls);

    if (neighborhood) {
      const trigger = await startCrawlIfEligible(neighborhood);
      if (trigger.started) {
        log.info("crawl started from a chat turn", { neighborhood, jobId: trigger.jobId });
        return NextResponse.json({
          ...result,
          crawl: { jobId: trigger.jobId, neighborhood },
        });
      }
      return NextResponse.json(result);
    }

    if (hadEmptyResult(result.toolCalls)) {
      return NextResponse.json({ ...result, needsNeighborhood: true });
    }

    return NextResponse.json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    log.error("agent failed", { ms: Date.now() - started, detail });
    return NextResponse.json({ error: "The assistant hit an error.", detail }, { status: 500 });
  }
}
