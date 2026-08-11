import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta";
import { SYSTEM_PROMPT } from "./system-prompt";
import { tools } from "./tools";

const MODEL = "claude-opus-5";

// Lazy singleton: importing this module must not throw just because no API
// key is configured yet - only actually running the agent should.
let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type AgentResult = {
  text: string;
  toolCalls: { name: string; input: unknown }[];
};

export async function runAgent(userMessage: string, history: ChatTurn[] = []): Promise<AgentResult> {
  const messages: BetaMessageParam[] = [
    ...history.map((h) => ({ role: h.role, content: h.content }) satisfies BetaMessageParam),
    { role: "user", content: userMessage },
  ];

  const toolCalls: { name: string; input: unknown }[] = [];

  const runner = getClient().beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    thinking: { type: "adaptive" },
    tools,
    messages,
    max_iterations: 8,
  });

  for await (const message of runner) {
    for (const block of message.content) {
      if (block.type === "tool_use") {
        toolCalls.push({ name: block.name, input: block.input });
      }
    }
  }

  const finalMessage = await runner.done();
  const textBlock = finalMessage.content.find((b) => b.type === "text");
  const text = textBlock && textBlock.type === "text" ? textBlock.text : "";

  return { text, toolCalls };
}
