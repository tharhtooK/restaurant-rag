import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import type { Golden } from "./types";

/**
 * LLM-as-judge for the grading rubric.
 *
 * `must_mention` and `must_not_claim` are semantic, not literal — "don't have"
 * should be satisfied by "isn't in my data", and "that Londel's is cheaper than
 * Manna's" is a claim, not a substring. Both therefore need a model to grade
 * them. The judge is itself fallible; its verdicts are advisory, and its
 * reasoning is recorded so a disputed call can be checked by hand.
 */
const JUDGE_MODEL = "gpt-5.6-terra";

const VerdictSchema = z.object({
  must_mention_results: z.array(
    z.object({
      item: z.string(),
      satisfied: z.boolean(),
      reason: z.string(),
    }),
  ),
  must_not_claim_results: z.array(
    z.object({
      item: z.string(),
      violated: z.boolean(),
      reason: z.string(),
    }),
  ),
});

export type Verdict = z.infer<typeof VerdictSchema>;

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI();
  return client;
}

export async function judge(golden: Golden, answer: string): Promise<Verdict> {
  const response = await getClient().responses.parse({
    model: JUDGE_MODEL,
    instructions:
      "You grade a restaurant assistant's answer against a rubric. Judge meaning, not wording: " +
      "a must_mention item counts as satisfied if the answer conveys it in any phrasing " +
      "(e.g. \"don't have\" is satisfied by \"that isn't in my data\"). A must_not_claim item " +
      "counts as violated only if the answer actually asserts it — merely mentioning a " +
      "restaurant, or explicitly ruling it out, is not a violation. Be strict about " +
      "fabrication and lenient about phrasing.",
    input: [
      {
        role: "user",
        content: [
          `USER QUESTION:\n${golden.query}`,
          `\nASSISTANT ANSWER:\n${answer}`,
          `\nmust_mention (should each be conveyed):\n${golden.grading_rubric.must_mention.map((m) => `- ${m}`).join("\n") || "- (none)"}`,
          `\nmust_not_claim (should each be absent):\n${golden.grading_rubric.must_not_claim.map((m) => `- ${m}`).join("\n") || "- (none)"}`,
        ].join("\n"),
      },
    ],
    text: { format: zodTextFormat(VerdictSchema, "verdict") },
  });

  const parsed = response.output_parsed;
  if (!parsed) throw new Error("judge returned no parsed output");
  return parsed;
}
