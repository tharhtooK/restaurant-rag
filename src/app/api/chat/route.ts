import { NextResponse } from "next/server";
import { runAgent, type ChatTurn } from "@/lib/agent";

export async function POST(request: Request) {
  const body = await request.json();
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const history: ChatTurn[] = Array.isArray(body?.history) ? body.history : [];

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  try {
    const result = await runAgent(message, history);
    return NextResponse.json(result);
  } catch (error) {
    console.error("agent error", error);
    const detail = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "The assistant hit an error.", detail }, { status: 500 });
  }
}
