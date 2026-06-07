/**
 * The Startup OS — AI Proxy
 *
 * Receives chat messages from the Odoo `startupos_ai_agent` module,
 * routes them through aigate.jboubix.net (unified AI gateway),
 * performs RAG over the startup playbook + tenant documents,
 * and executes Odoo tool calls (create invoice, add task, etc.) via JSON-RPC.
 *
 * The Odoo side never talks to OpenAI directly — it always goes through this proxy
 * so we control quotas, audit, and tool execution.
 */
import { Hono } from "hono";

type Bindings = {
  AI_GATEWAY: any;     // Cloudflare AI Gateway binding (to aigate.jboubix.net)
  AIGATE_API_KEY: string;
  ODOO_MASTER_PASS: string;
  ODOO_RPC_URL: string;
  RAG?: VectorizeIndex;
  QUOTAS?: KVNamespace;
};

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
};

type ChatRequest = {
  tenant_db: string;           // e.g. "acmecorp"
  user_message: string;        // latest message from the founder
  history?: ChatMessage[];     // rolling window of prior messages
  // Context the Odoo side sends along with the message:
  context?: {
    user_id?: number;
    user_name?: string;
    startup_stage?: "idea" | "building" | "first_customer" | "funded" | "scaling";
    plan?: "solo" | "team" | "growth" | "scale";
  };
};

const app = new Hono<{ Bindings: Bindings }>();

// Health
app.get("/health", (c) => c.json({ status: "ok" }));

/**
 * Main chat endpoint.
 * Called by `startupos_ai_agent/controllers/main.py` inside Odoo.
 */
app.post("/chat", async (c) => {
  const req = await c.req.json<ChatRequest>();
  const env = c.env;

  // 1. Quota check (per tenant, per month)
  const monthKey = new Date().toISOString().slice(0, 7); // "2026-06"
  const usedKey = `quota:${req.tenant_db}:${monthKey}`;
  const used = parseInt((await env.QUOTAS?.get(usedKey)) ?? "0", 10);
  const limit = planLimit(req.context?.plan);
  if (used >= limit) {
    return c.json({
      reply: `You've used all ${limit} AI queries for this month on your ${req.context?.plan ?? "solo"} plan. Upgrade for more, or wait until next month.`,
      quota_exceeded: true,
    }, 402);
  }

  // 2. RAG: retrieve relevant playbook snippets
  const ragContext = await retrieveRAG(env, req);

  // 3. Build messages for the LLM
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(req, ragContext) },
    ...(req.history ?? []).slice(-10),     // last 10 turns
    { role: "user", content: req.user_message },
  ];

  // 4. Define the tools the LLM can call (Odoo JSON-RPC wrappers)
  const tools = odooToolDefinitions();

  // 5. Call aigate.jboubix.net
  const aigateRes = await fetch(`${env.AI_GATEWAY?.url ?? "https://aigate.jboubix.net"}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.AIGATE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",                   // cheap + good for tool calls
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.4,
    }),
  });

  if (!aigateRes.ok) {
    const err = await aigateRes.text();
    return c.json({ error: "aigate_error", detail: err }, 502);
  }

  const aigateJson: any = await aigateRes.json();
  const choice = aigateJson.choices?.[0];
  const message = choice?.message;

  // 6. If the LLM wants to call tools, execute them via Odoo JSON-RPC
  let finalReply = message?.content ?? "";
  const toolCalls = message?.tool_calls ?? [];

  for (const call of toolCalls) {
    const name = call.function?.name;
    let args: any = {};
    try { args = JSON.parse(call.function?.arguments ?? "{}"); } catch {}

    let result: any;
    try {
      result = await executeOdooTool(env, req, name, args);
    } catch (e: any) {
      result = { error: e?.message ?? "tool_execution_failed" };
    }

    // If the LLM produced a final reply already, keep it; else ask LLM to summarize
    if (!finalReply && choice.finish_reason === "tool_calls") {
      const followup = await fetch(`${env.AI_GATEWAY?.url ?? "https://aigate.jboubix.net"}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.AIGATE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            ...messages,
            message,
            { role: "tool", tool_call_id: call.id, content: JSON.stringify(result) },
          ],
          temperature: 0.4,
        }),
      });
      const followupJson: any = await followup.json();
      finalReply = followupJson.choices?.[0]?.message?.content ?? "Done.";
    }
  }

  // 7. Bump quota
  await env.QUOTAS?.put(usedKey, String(used + 1), { expirationTtl: 60 * 60 * 24 * 60 });

  return c.json({ reply: finalReply, quota_used: used + 1, quota_limit: limit });
});

/**
 * RAG: query Vectorize for snippets relevant to the user's message.
 * In production, also fetch tenant-specific documents from Odoo
 * (uploaded pitch decks, business plans, etc.) and embed + index them.
 */
async function retrieveRAG(env: Bindings, req: ChatRequest): Promise<string> {
  if (!env.RAG) return "";
  // For now, just return an empty context. The full RAG pipeline (embed
  // → query Vectorize → re-rank) is wired in once Vectorize is created.
  return "";
}

function systemPrompt(req: ChatRequest, ragContext: string): string {
  const stage = req.context?.startup_stage ?? "idea";
  const plan = req.context?.plan ?? "solo";
  return `You are the Startup Coach inside The Startup OS, an Odoo-based platform for non-technical founders.

You are talking to a founder in the "${stage}" stage on the "${plan}" plan.

Your job:
- Answer questions about running their startup
- Execute actions in their Odoo workspace (create invoices, add tasks, log expenses, check pipeline, etc.)
- Recommend next steps based on their stage
- Be concise, direct, and friendly — founders are busy

You can call Odoo tools to do things. When you do, summarize the result in 1-2 sentences.

${ragContext ? `\nRelevant playbook context:\n${ragContext}\n` : ""}`;
}

function planLimit(plan?: string): number {
  switch (plan) {
    case "scale": return 1_000_000;
    case "growth": return 10_000;
    case "team": return 2_000;
    case "solo":
    default: return 200;
  }
}

/**
 * Odoo tool definitions — what the LLM is allowed to call.
 * Each one maps to a JSON-RPC call against the tenant's Odoo DB.
 */
function odooToolDefinitions() {
  return [
    {
      type: "function",
      function: {
        name: "get_runway",
        description: "Compute how many months of runway the startup has based on bank balance and recent expenses.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "list_open_invoices",
        description: "List unpaid customer invoices.",
        parameters: { type: "object", properties: { partner_name: { type: "string" } }, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "create_invoice",
        description: "Create a draft invoice for a customer.",
        parameters: {
          type: "object",
          properties: {
            partner_name: { type: "string" },
            amount: { type: "number" },
            description: { type: "string" },
          },
          required: ["partner_name", "amount"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "create_task",
        description: "Add a task to a project (e.g. \"Follow up with ACME\").",
        parameters: {
          type: "object",
          properties: {
            project: { type: "string" },
            task_name: { type: "string" },
            due_date: { type: "string", description: "YYYY-MM-DD" },
          },
          required: ["task_name"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "summarize_pipeline",
        description: "Summarize the CRM pipeline: stages, deal counts, total value, expected close dates.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "log_expense",
        description: "Log a business expense.",
        parameters: {
          type: "object",
          properties: {
            amount: { type: "number" },
            category: { type: "string" },
            description: { type: "string" },
          },
          required: ["amount"],
        },
      },
    },
  ];
}

/**
 * Execute a tool by calling Odoo's JSON-RPC API.
 *
 * This is where the actual work happens. The proxy authenticates to the
 * tenant DB as `admin` using the master password (because we're a
 * service, not a user). In production we'd use per-user service accounts.
 */
async function executeOdooTool(env: Bindings, req: ChatRequest, name: string, args: any): Promise<any> {
  const db = req.tenant_db;
  // Helper: positional-args RPC. limit/offset/order go in the *args tail, not kwargs.
  const rpc = (model: string, method: string, params: any[] = [], kwargs: any = {}) =>
    callOdoo(env, db, model, method, params, kwargs);
  // Helper: search with limit (limit is the 4th positional arg of execute_kw)
  const search = (model: string, domain: any[], fields: string[], limit = 0) =>
    callOdoo(env, db, model, "search_read", [domain, fields], { limit });

  switch (name) {
    case "get_runway": {
      // sum account.move lines where account is bank/cash, last 30 days expenses
      const bankBalance = await rpc("account.account", "search_read",
        [[["account_type", "=", "asset_cash"]], ["id", "name"]]);
      const recentExpenses = await rpc("account.move.line", "search_read",
        [[["date", ">=", isoDate(-30)], ["account_id.account_type", "=", "expense"]], ["balance"]]);
      const totalExpenses = recentExpenses.reduce((s: number, l: any) => s + Math.abs(l.balance), 0);
      const monthlyBurn = totalExpenses / 30 * 30 || 1;
      // For the bank balance we'd need to read move lines, simplified:
      return {
        bank_accounts: bankBalance.length,
        monthly_burn_estimate: monthlyBurn,
        note: "Connect a bank feed for live balance; showing expense-based estimate.",
      };
    }
    case "list_open_invoices": {
      const domain = [["state", "=", "posted"], ["payment_state", "=", "not_paid"], ["move_type", "=", "out_invoice"]];
      if (args.partner_name) domain.push(["partner_id.name", "ilike", args.partner_name]);
      const invoices = await rpc("account.move", "search_read",
        [domain, ["name", "partner_id", "amount_total", "amount_residual", "invoice_date_due"]]);
      return { count: invoices.length, total_outstanding: invoices.reduce((s: number, i: any) => s + i.amount_residual, 0), invoices: invoices.slice(0, 20) };
    }
    case "create_invoice": {
      const partner = await search("res.partner",
        [["name", "ilike", args.partner_name]], ["id"], 1);
      if (!partner.length) return { error: `No contact found matching "${args.partner_name}"` };
      const invoiceId = await rpc("account.move", "create", [{
        move_type: "out_invoice",
        partner_id: partner[0],
        invoice_line_ids: [[0, 0, { name: args.description ?? "Services", quantity: 1, price_unit: args.amount }]],
      }]);
      return { created_invoice_id: invoiceId, status: "draft" };
    }
    case "create_task": {
      let projectId: number | undefined;
      if (args.project) {
        const found = await search("project.project",
          [["name", "ilike", args.project]], ["id"], 1);
        projectId = found[0]?.id;
      }
      const taskId = await rpc("project.task", "create", [{
        name: args.task_name,
        project_id: projectId,
        date_deadline: args.due_date,
      }]);
      return { created_task_id: taskId };
    }
    case "summarize_pipeline": {
      const stages = await rpc("crm.stage", "search_read", [[], ["name", "sequence"]], { order: "sequence asc" });
      const deals = await rpc("crm.lead", "read_group",
        [[], ["stage_id", "expected_revenue", "probability"], ["stage_id"]]);
      return {
        stages: stages.map((s: any) => ({
          name: s.name,
          deal_count: deals.find((d: any) => d.stage_id[0] === s.id)?.stage_id_count ?? 0,
          total_value: deals.find((d: any) => d.stage_id[0] === s.id)?.expected_revenue ?? 0,
        })),
      };
    }
    case "log_expense": {
      const productId = await search("product.product",
        [["name", "ilike", args.category ?? "expense"]], ["id"], 1);
      const id = await rpc("hr.expense", "create", [{
        name: args.description ?? args.category ?? "Expense",
        total_amount: args.amount,
        product_id: productId[0],
      }]);
      return { created_expense_id: id, status: "draft" };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/**
 * Low-level Odoo JSON-RPC helper.
 */
async function callOdoo(env: Bindings, db: string, model: string, method: string, args: any[], kwargs: any = {}): Promise<any> {
  // Authenticate as admin
  const authRes = (await fetch(env.ODOO_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "common",
        method: "login",
        args: [db, "admin", env.ODOO_MASTER_PASS],
      },
      id: 1,
    }),
  }).then((r) => r.json())) as { result?: number; error?: any };

  const uid = authRes.result;
  if (!uid) throw new Error("Odoo auth failed");

  // Execute
  const callRes = (await fetch(env.ODOO_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [db, uid, env.ODOO_MASTER_PASS, model, method, args, kwargs],
      },
      id: 2,
    }),
  }).then((r) => r.json())) as { result?: any; error?: any };

  if (callRes.error) throw new Error(callRes.error.message ?? "Odoo RPC error");
  return callRes.result;
}

function isoDate(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

export default app;
