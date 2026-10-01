/**
 * jev-quickstart-with-openrouter-00-en.ts
 *
 * English variant of the q00 quickstart — the SAME scenario, translated.
 * Purpose: compare Jev's answers across languages head-to-head.
 *
 * How to run:
 *   export OPENROUTER_API_KEY=sk-or-...
 *   export OPENROUTER_BASE_URL=https://openrouter.ai/api/v1   # optional
 *   export JEV_MODEL=typesafe/jev-1.13                        # optional
 *   npm run q00-en   # or: npx tsx src/jev-quickstart-with-openrouter-00-en.ts
 */

// ---------------------------------------------------------------------------
// Config from environment
// ---------------------------------------------------------------------------

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("ERROR: OPENROUTER_API_KEY is not set.");
  console.error("Example: export OPENROUTER_API_KEY=sk-or-...");
  process.exit(1);
}

// The Decisions API lives at /api/alpha/decisions (not /api/v1).
const baseUrl = (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
const decisionsUrl = baseUrl.replace(/\/v1$/, "") + "/alpha/decisions";

// Model can be overridden; default pins a stable version.
const model = process.env.JEV_MODEL ?? "typesafe/jev-1.13";

// ---------------------------------------------------------------------------
// Jev question & answer types
// ---------------------------------------------------------------------------

type Question =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string; criteria?: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

interface DecisionsRequest {
  model: string;
  state: string;
  questions: Record<string, Question>;
}

interface DecisionsResponse {
  id: string;
  model: string;
  provider: string;
  answers: Record<string, any>;
  usage?: {
    cost?: number;
    inputTokens?: number;
    outputTokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
}

// ---------------------------------------------------------------------------
// Example state: support ticket triage (1 state, 3 parallel questions)
// Mirrors the Indonesian q00 scenario exactly.
// ---------------------------------------------------------------------------

const requestBody: DecisionsRequest = {
  model,
  state:
    "Ticket #4821 from a Pro-plan customer. Content: 'I was charged twice this month, " +
    "please refund one of them as soon as possible.' History: never late on payments. " +
    "Alternatives: (a) route to the billing team — fits because this is a billing dispute; " +
    "(b) auto-reply — rejected because the customer asks for a specific action; " +
    "(c) escalate to a manager — not needed yet since there has been no refusal.",
  questions: {
    intent: {
      type: "choice",
      instructions: "Which team should handle this ticket?",
      criteria: {
        billing: "Billing disputes, refunds, or payments.",
        technical: "Product bugs or integration issues.",
        other: "Neither billing nor technical.",
      },
    },
    escalate: {
      type: "noul",
      instructions: "Should this ticket be escalated to a manager right now?",
    },
    urgency: {
      type: "score",
      instructions: "How urgent is this ticket?",
      criteria: ["can wait", "this week", "today"],
    },
  },
};

// ---------------------------------------------------------------------------
// Call the API
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Model : ${model}`);
  console.log(`URL   : ${decisionsUrl}\n`);

  const res = await fetch(decisionsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/Faishalbhitex/jev-usecase",
      "X-Title": "jev-usecase quickstart (en)",
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`ERROR: HTTP ${res.status}\n${text.slice(0, 500)}`);
    if (res.status === 401 || res.status === 403) {
      console.error("\nHint: check OPENROUTER_API_KEY (starts with sk-or-...).");
    }
    process.exit(1);
  }

  const data = (await res.json()) as DecisionsResponse;

  console.log("--- answers ---");
  for (const [name, ans] of Object.entries(data.answers)) {
    console.log(`\n[${name}] type=${ans.type}`);
    if (ans.type === "choice") {
      console.log(`  choice      : ${ans.choice}`);
      console.log(`  confidence  : ${ans.confidence}`);
      console.log(`  probabilities: ${JSON.stringify(ans.probabilities)}`);
      console.log(`  verdict: ${ans.confidence < 0.4 ? "UNCERTAIN (confidence < 0.4)" : "OK"}`);
    } else if (ans.type === "noul") {
      const verdict = ans.noul >= 0.7 ? "YES" : ans.noul <= 0.3 ? "NO" : "UNCERTAIN";
      console.log(`  noul  : ${ans.noul} -> ${verdict}`);
    } else if (ans.type === "score") {
      console.log(`  score : ${ans.score} (ignore aggregate; read per-dimension)`);
      console.log(`  legend: ${JSON.stringify(ans.legend)}`);
      if (ans.probabilities) {
        console.log(`  probabilities: ${JSON.stringify(ans.probabilities)}`);
      }
    } else {
      console.log(`  ${JSON.stringify(ans)}`);
    }
  }

  if (data.usage) {
    const inTok = data.usage.inputTokens ?? data.usage.input_tokens;
    const outTok = data.usage.outputTokens ?? data.usage.output_tokens;
    console.log(`\nusage: inputTokens=${inTok} outputTokens=${outTok} cost=$${data.usage.cost}`);
  }
  console.log(`\nresponse id: ${data.id} | served model: ${data.model}`);
}

main().catch((err) => {
  console.error("ERROR:", err.message ?? err);
  process.exit(1);
});
