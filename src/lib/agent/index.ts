import OpenAI from "openai";
import type { ResponseInput, ResponseInputItem } from "openai/resources/responses/responses";
import { SYSTEM_PROMPT } from "./system-prompt";
import { toolDefinitions, runTool } from "./tools";

const MODEL = "gpt-5.6-terra";
const MAX_TOOL_ITERATIONS = 8;

// Lazy singleton: importing this module must not throw just because no API
// key is configured yet - only actually running the agent should.
let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI();
  return client;
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type AgentResult = {
  text: string;
  toolCalls: { name: string; input: unknown }[];
};

export async function runAgent(userMessage: string, history: ChatTurn[] = []): Promise<AgentResult> {
  const toolCalls: { name: string; input: unknown }[] = [];

  const input: ResponseInput = [
    ...history.map(
      (h): ResponseInputItem => ({
        role: h.role,
        content: h.content,
      }),
    ),
    { role: "user", content: userMessage },
  ];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await getClient().responses.create({
      model: MODEL,
      instructions: SYSTEM_PROMPT,
      tools: toolDefinitions,
      input,
    });

    const functionCalls = response.output.filter((item) => item.type === "function_call");

    if (functionCalls.length === 0) {
      return { text: response.output_text, toolCalls };
    }

    // response.output items round-trip as input items for the next request; the
    // SDK's types diverge only on a computer-use variant we never emit here.
    input.push(...(response.output as unknown as ResponseInputItem[]));

    for (const call of functionCalls) {
      let args: unknown = {};
      try {
        args = JSON.parse(call.arguments);
      } catch {
        // leave args as {} - runTool's zod validation will report the problem
      }
      toolCalls.push({ name: call.name, input: args });

      const output = await runTool(call.name, args);
      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output,
      });
    }
  }

  return {
    text: "I wasn't able to finish looking that up in a reasonable number of steps - could you try rephrasing?",
    toolCalls,
  };
}
