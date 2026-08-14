import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgent } from "@/lib/agent";
import { getLogger } from "@/lib/logger";
import { hadEmptyResult } from "@/lib/crawl-offer";
import { describeLocation, parseLocation } from "@/lib/location";
import { startCrawlIfEligible } from "@/lib/crawl-trigger";
import type { ChatResponse } from "@/lib/chat-contract";

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
  // True only when the previous turn showed the "which neighborhood?" ask, so
  // this message is an answer to it. A crawl needs that consent: without it a
  // passing mention like "near Brooklyn" would spend money on a borough nobody
  // asked us to fetch.
  answeringNeighborhood: z.boolean().default(false),
  // The session's location, once the user has given one. Asked for once, then
  // resent each turn so the agent never asks twice.
  location: z.string().optional(),
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
    const result = await runAgent(message, parsed.data.history, {
      location: parsed.data.location,
    });
    log.info("chat request answered", {
      ms: Date.now() - started,
      toolCalls: result.toolCalls.map(tool => tool.name).join(", "),
    });

    // The location comes from the user's own words, not from a tool argument, so
    // the model cannot redirect what gets crawled.
    if (parsed.data.answeringNeighborhood) {
      const location = parseLocation(message);
      if (location) {
        const label = describeLocation(location);
        const trigger = await startCrawlIfEligible(location);
        if (trigger.started) {
          log.info("crawl started from a chat turn", { location: label, jobId: trigger.jobId });
          const body: ChatResponse = {
            ...result,
            crawl: { jobId: trigger.jobId, location: label },
          };
          return NextResponse.json(body);
        }
        // Covered, capped, recently unproductive, or the crawler is down. Answer
        // plainly rather than asking again, which would loop.
        log.info("no crawl for answered location", { location: label, reason: trigger.reason });
        const body: ChatResponse = { ...result };
        if (trigger.reason === "unavailable") body.crawlUnavailable = true;
        return NextResponse.json(body);
      }
    }

    // Two ways a turn can need a location from the user: a lookup came back
    // empty, or the agent asked for one in prose instead of searching. The
    // second calls no tools at all, and without catching it the reply is not
    // treated as an answer - which is how "minesota" was silently dropped.
    const askedInProse = !parsed.data.location && result.toolCalls.length === 0;

    if (hadEmptyResult(result.toolCalls) || askedInProse) {
      const body: ChatResponse = { ...result, needsNeighborhood: true };
      return NextResponse.json(body);
    }

    return NextResponse.json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    log.error("agent failed", { ms: Date.now() - started, detail });
    return NextResponse.json({ error: "The assistant hit an error.", detail }, { status: 500 });
  }
}
