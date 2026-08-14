import type {
  ResponseFunctionToolCall,
  ResponseInput,
  ResponseInputItem,
} from "openai/resources/responses/responses";
import { getOpenAI } from "@/lib/openai";
import { getLogger } from "@/lib/logger";
import { buildSystemPrompt } from "./system-prompt";
import { toolDefinitions, runTool } from "./tools";

// Overridable so a different provider is an .env change rather than a source
// edit: gpt-5.6-terra is a LiteLLM alias and does not exist on api.openai.com.
const MODEL = process.env.OPENAI_MODEL || "gpt-5.6-terra";
const MAX_TOOL_ITERATIONS = 8;

const log = getLogger("agent");

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ToolCallRecord = {
  name: string;
  input: unknown;
  output: string;
};

export type AgentResult = {
  text: string;
  toolCalls: ToolCallRecord[];
};

function buildInput(userMessage: string, history: ChatTurn[]): ResponseInput {
  const turns = history.map(
    (turn): ResponseInputItem => ({ role: turn.role, content: turn.content }),
  );
  return [...turns, { role: "user", content: userMessage }];
}

async function executeToolCall(call: ResponseFunctionToolCall): Promise<ToolCallRecord> {
  let args: unknown;
  try {
    args = JSON.parse(call.arguments);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.warn("tool arguments were not valid JSON", { tool: call.name, reason });
    return {
      name: call.name,
      input: call.arguments,
      output: JSON.stringify({
        error: `Arguments were not valid JSON (${reason}): ${call.arguments}`,
      }),
    };
  }

  const started = Date.now();
  const output = await runTool(call.name, args);
  log.debug("tool call finished", {
    tool: call.name,
    ms: Date.now() - started,
    bytes: output.length,
  });
  return { name: call.name, input: args, output };
}

export type RunAgentOptions = { location?: string };

export async function runAgent(
  userMessage: string,
  history: ChatTurn[] = [],
  options: RunAgentOptions = {},
): Promise<AgentResult> {
  const toolCalls: ToolCallRecord[] = [];
  const input = buildInput(userMessage, history);
  const instructions = buildSystemPrompt(options.location);

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const started = Date.now();
    const response = await getOpenAI().responses.create({
      model: MODEL,
      instructions,
      tools: toolDefinitions,
      input,
    });
    log.debug("model responded", { model: MODEL, iteration, ms: Date.now() - started });

    const functionCalls = response.output.filter((item) => item.type === "function_call");

    if (functionCalls.length === 0) {
      return { text: response.output_text, toolCalls };
    }

    // response.output items round-trip as input items for the next request; the
    // SDK's types diverge only on a computer-use variant we never emit here.
    input.push(...(response.output as unknown as ResponseInputItem[]));

    for (const call of functionCalls) {
      const record = await executeToolCall(call);
      toolCalls.push(record);
      input.push({ type: "function_call_output", call_id: call.call_id, output: record.output });
    }
  }

  log.warn("hit the tool iteration ceiling", {
    limit: MAX_TOOL_ITERATIONS,
    toolCalls: toolCalls.length,
  });
  return {
    text: "I wasn't able to finish looking that up in a reasonable number of steps - could you try rephrasing?",
    toolCalls,
  };
}
