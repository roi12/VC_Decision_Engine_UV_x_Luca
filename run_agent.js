const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

// Finds the last complete top-level JSON object in a string by scanning
// backwards from the last '}' to its matching '{'.
function extractLastJson(text) {
  let end = -1;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === '}') { end = i; break; }
  }
  if (end === -1) throw new Error('No JSON object found in model response');

  let depth = 0;
  let start = -1;
  for (let i = end; i >= 0; i--) {
    if (text[i] === '}') depth++;
    else if (text[i] === '{') {
      depth--;
      if (depth === 0) { start = i; break; }
    }
  }
  if (start === -1) throw new Error('Unmatched braces in model response');

  return JSON.parse(text.slice(start, end + 1));
}

// ─── Web search tool execution ─────────────────────────────────────────────
// Called by streamAgentEvents when Claude invokes the web_search tool.
// Searches DuckDuckGo HTML endpoint and fetches the first usable result page.

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const SKIP_DOMAINS = ['linkedin.com', 'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'youtube.com'];

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function executeWebSearch(query) {
  try {
    const ddgRes = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { headers: FETCH_HEADERS, signal: AbortSignal.timeout(8000) }
    );
    if (!ddgRes.ok) return `No results found for: ${query}`;

    const html = await ddgRes.text();

    // Extract destination URLs from DuckDuckGo redirect links (uddg= param)
    const urls = [];
    const re = /uddg=([^&"'\s>]+)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      try {
        const u = decodeURIComponent(m[1]);
        if (u.startsWith('http') && !u.includes('duckduckgo.com')) urls.push(u);
      } catch {}
    }

    const candidates = [...new Set(urls)].filter(u => !SKIP_DOMAINS.some(d => u.includes(d)));
    if (candidates.length === 0) return `No usable results for: ${query}`;

    for (const url of candidates.slice(0, 3)) {
      try {
        const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(7000), redirect: 'follow' });
        if (!res.ok) continue;
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('text/html')) continue;
        const text = stripHtml(await res.text()).slice(0, 2000);
        if (text.length > 100) return `[Source: ${res.url}]\n${text}`;
      } catch {}
    }
    return `Could not fetch content for: ${query}`;
  } catch {
    return `Search failed for: ${query}`;
  }
}

// ─── Agent detection patterns ──────────────────────────────────────────────

const AGENTS = [
  { key: 'founder',       label: 'Founder Agent',      pattern: /"evidence_strength"/ },
  { key: 'product',       label: 'Product Agent',       pattern: /"validated"/ },
  { key: 'traction',      label: 'Traction Agent',      pattern: /"forbidden_evidence"/ },
  { key: 'market',        label: 'Market Agent',        pattern: /"specific_insight"/ },
  { key: 'risk',          label: 'Risk Agent',          pattern: /"deal_breakers"/ },
  { key: 'falsification', label: 'Falsification Agent', pattern: /"why_this_fails"/ },
  { key: 'thesis',        label: 'Thesis Fit Agent',    pattern: /"uv_fit"/ },
  { key: 'decision',      label: 'Investment Decision', pattern: /"one_line_verdict"/ },
];

// ─── Due Diligence streaming ───────────────────────────────────────────────
// Claude calls web_search (up to 5 times) before running the 8 DD agents.
// The tool loop re-streams after each search round until Claude outputs end_turn.

const WEB_SEARCH_TOOL = {
  name: 'web_search',
  description: 'Search the web for current information about a company. Use this to find real, up-to-date facts about the founder, product, traction, funding, and news before running analysis. Do not rely on training knowledge.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query, e.g. "Stripe founder Patrick Collison background"' },
    },
    required: ['query'],
  },
};

async function* streamAgentEvents(input, apiKey = null) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured on the server');

  const client = new Anthropic({ apiKey: key });

  const claudeMd  = fs.readFileSync(path.join(ROOT, 'claude.md'),      'utf8');
  const agentsMd  = fs.readFileSync(path.join(ROOT, 'docs/agents.md'), 'utf8');
  const promptsMd = fs.readFileSync(path.join(ROOT, 'prompts.md'),     'utf8');
  const systemContext = [claudeMd, agentsMd, promptsMd].join('\n\n---\n\n');

  const DD_JSON_SCHEMA = `{
  "signals": {
    "thesis_fit":           { "value": "", "confidence": 0.0, "source": "" },
    "origin_signal":        { "value": "", "confidence": 0.0, "source": "" },
    "technical_depth":      { "value": "", "confidence": 0.0, "source": "" },
    "institutional_signal": { "value": "", "confidence": 0.0, "source": "" },
    "market_signal":        { "value": "", "confidence": 0.0, "source": "" },
    "timing_signal":        { "value": "", "confidence": 0.0, "source": "" }
  },
  "decision": "invest or pass",
  "reasoning": ["key reason 1", "key reason 2", "key reason 3"]
}`;

  const messages = [{
    role: 'user',
    content:
`Run DUE DILIGENCE for: ${input}

Use web_search to gather real data. Search for:
1. Company overview and product
2. Founder background and team
3. Funding history and investors
4. Evidence of traction (revenue, customers, contracts)
5. Recent news (2024–2025)

Then internally run all 8 DD agents (Founder, Product, Traction, Market, Risk, Falsification, Thesis Fit, Investment Decision) grounded in the search data.

YOUR ENTIRE RESPONSE MUST BE ONLY THE FOLLOWING JSON OBJECT — no prose, no markdown fences, no agent output blocks, nothing else:

${DD_JSON_SCHEMA}`,
  }];

  let fullText = '';
  const completed = new Set();
  let searchesUsed = 0;
  const MAX_SEARCHES = 5;

  while (true) {
    const stream = client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 8192,
      system: systemContext,
      ...(searchesUsed < MAX_SEARCHES && { tools: [WEB_SEARCH_TOOL] }),
      messages,
    });

    // Track content blocks by index so we can assemble tool input JSON
    const blocks = {};

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_start') {
        blocks[chunk.index] = { ...chunk.content_block, inputJson: '' };
      }
      if (chunk.type === 'content_block_delta') {
        if (chunk.delta.type === 'text_delta') {
          fullText += chunk.delta.text;
          for (const agent of AGENTS) {
            if (!completed.has(agent.key) && agent.pattern.test(fullText)) {
              completed.add(agent.key);
              yield { type: 'agent', key: agent.key, label: agent.label };
            }
          }
        }
        if (chunk.delta.type === 'input_json_delta' && blocks[chunk.index]) {
          blocks[chunk.index].inputJson += chunk.delta.partial_json;
        }
      }
    }

    const finalMsg = await stream.finalMessage();

    // If Claude is done, exit the loop
    if (finalMsg.stop_reason !== 'tool_use') break;

    const toolUseBlocks = Object.values(blocks).filter(b => b.type === 'tool_use');
    if (toolUseBlocks.length === 0) break;

    // Add Claude's response to the conversation
    messages.push({ role: 'assistant', content: finalMsg.content });

    // Execute each web search and collect results
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        let query = input;
        try { query = JSON.parse(block.inputJson).query || input; } catch {}
        searchesUsed++;
        const result = await executeWebSearch(query);
        return { type: 'tool_result', tool_use_id: block.id, content: result };
      })
    );

    messages.push({ role: 'user', content: toolResults });
  }

  const raw = fullText.trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  let finalResult;
  try {
    finalResult = extractLastJson(raw);
  } catch {
    // Fallback: Claude output prose instead of JSON — ask it to reformat
    const fallback = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content:
`The following is a due diligence analysis. Extract the key conclusions and return ONLY this JSON object (no other text):

${DD_JSON_SCHEMA}

Analysis:
${raw || '(no analysis output — return all confidence values as 0.3 and decision as "pass")'}`,
      }],
    });
    finalResult = extractLastJson(fallback.content[0].text);
  }

  yield { type: 'done', result: finalResult };
}

// ─── Intake result normalizer ─────────────────────────────────────────────
// Maps the raw multi-agent JSON { scouter, signal_extractor, thesis_fit, decision }
// to the flat IntakeResult shape the frontend expects.

function normalizeIntakeResult(raw) {
  const scouter   = raw.scouter          || {};
  const extractor = raw.signal_extractor || {};
  const thesis    = raw.thesis_fit       || {};
  const decision  = raw.decision         || {};

  const tractionMap  = { strong: 0.8, medium: 0.6, weak: 0.3, none: 0.1 };
  const fitMap       = { high: 0.8, medium: 0.5, low: 0.2 };
  const tScore = tractionMap[(extractor.traction_signal || '').toLowerCase()] ?? 0.3;
  const fScore = fitMap[(thesis.uv_fit || '').toLowerCase()] ?? 0.3;

  return {
    company:    scouter.startup_name || '',
    summary:    scouter.description  || '',
    quick_take: decision.reason      || thesis.reason || '',
    confidence: Math.round(((tScore + fScore) / 2) * 100) / 100,
    signals: {
      thesis_fit:           thesis.uv_fit                || '',
      origin_signal:        scouter.location             || '',
      technical_depth:      extractor.advantage_type     || '',
      institutional_signal: scouter.total_raised         || '',
      market_signal:        extractor.traction_signal    || '',
      timing_signal:        scouter.stage                || '',
    },
  };
}

// ─── Intake streaming ──────────────────────────────────────────────────────
// Intake is grounded on pre-fetched website data — no web_search tool needed.

const INTAKE_AGENTS = [
  { key: 'scouter',          label: 'Scouter',          pattern: /"startup_name"/ },
  { key: 'source_checker',   label: 'Source Checker',   pattern: /"claims_verified"/ },
  { key: 'signal_extractor', label: 'Signal Extractor', pattern: /"unfair_advantage"/ },
  { key: 'thesis_fit',       label: 'Thesis Fit',       pattern: /"uv_fit"/ },
];

async function* streamIntakeEvents(input, apiKey = null, groundData = null) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured on the server');

  const client = new Anthropic({ apiKey: key });

  const claudeMd  = fs.readFileSync(path.join(ROOT, 'claude.md'),      'utf8');
  const agentsMd  = fs.readFileSync(path.join(ROOT, 'docs/agents.md'), 'utf8');
  const promptsMd = fs.readFileSync(path.join(ROOT, 'prompts.md'),     'utf8');
  const systemContext = [claudeMd, agentsMd, promptsMd].join('\n\n---\n\n');

  // Build user content — pre-fetched website data is the primary source,
  // web_search tool is available for supplementary context (founder, funding, news).
  let userContent;
  if (groundData && groundData.website_text && groundData.website_text.length > 0) {
    const facts = (groundData.extracted_facts || []).map(f => `- ${f}`).join('\n') || '- none extracted';
    userContent =
`Run INTAKE for: ${input}

PRIMARY SOURCE (company website):

Source: ${groundData.source_url || 'unknown'}

Website Text:
---
${groundData.website_text.slice(0, 3500)}
---

Extracted Facts:
${facts}

You may use web_search (up to 3 times) to supplement this data — e.g. founder background, funding signals, recent news. Then run all 4 intake agents.`;
  } else {
    userContent =
`Run INTAKE for: ${input}

No website data was pre-fetched. Use web_search to find information about this company, then run all 4 intake agents.`;
  }

  const messages = [{ role: 'user', content: userContent }];
  let fullText = '';
  const completed = new Set();
  let searchesUsed = 0;
  const MAX_SEARCHES = 3; // Lower cap than DD — intake is fast and directional

  while (true) {
    const stream = client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: systemContext,
      ...(searchesUsed < MAX_SEARCHES && { tools: [WEB_SEARCH_TOOL] }),
      messages,
    });

    const blocks = {};

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_start') {
        blocks[chunk.index] = { ...chunk.content_block, inputJson: '' };
      }
      if (chunk.type === 'content_block_delta') {
        if (chunk.delta.type === 'text_delta') {
          fullText += chunk.delta.text;
          for (const agent of INTAKE_AGENTS) {
            if (!completed.has(agent.key) && agent.pattern.test(fullText)) {
              completed.add(agent.key);
              yield { type: 'agent', key: agent.key, label: agent.label };
            }
          }
        }
        if (chunk.delta.type === 'input_json_delta' && blocks[chunk.index]) {
          blocks[chunk.index].inputJson += chunk.delta.partial_json;
        }
      }
    }

    const finalMsg = await stream.finalMessage();
    if (finalMsg.stop_reason !== 'tool_use') break;

    const toolUseBlocks = Object.values(blocks).filter(b => b.type === 'tool_use');
    if (toolUseBlocks.length === 0) break;

    messages.push({ role: 'assistant', content: finalMsg.content });

    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        let query = input;
        try { query = JSON.parse(block.inputJson).query || input; } catch {}
        searchesUsed++;
        const result = await executeWebSearch(query);
        return { type: 'tool_result', tool_use_id: block.id, content: result };
      })
    );

    messages.push({ role: 'user', content: toolResults });
  }

  const raw = fullText.trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  let intakeResult;
  try {
    intakeResult = extractLastJson(raw);
  } catch {
    // Fallback: Claude output prose instead of JSON — ask it to reformat
    const fallback = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content:
`The following is an intake analysis. Extract the key conclusions and return ONLY a valid JSON object with this structure (no other text):

{
  "scouter": { "startup_name": "", "description": "", "location": "", "stage": "", "founded": "", "total_raised": "" },
  "source_checker": { "claims_verified": [], "unknown": [] },
  "signal_extractor": { "unfair_advantage": "", "advantage_type": "", "traction_signal": "", "evidence": [], "diverse_founder": "" },
  "thesis_fit": { "uv_fit": "", "reason": "" },
  "decision": { "decision": "", "reason": "" }
}

Analysis:
${raw || '(no analysis output — return uv_fit as "unknown" and decision as "pass")'}`,
      }],
    });
    intakeResult = extractLastJson(fallback.content[0].text);
  }

  yield { type: 'done', result: normalizeIntakeResult(intakeResult) };
}

// ─── Non-streaming runAgent (CLI use) ─────────────────────────────────────

async function runAgent(input, apiKey = null) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured on the server');

  const client = new Anthropic({ apiKey: key });

  const claudeMd  = fs.readFileSync(path.join(ROOT, 'claude.md'),      'utf8');
  const agentsMd  = fs.readFileSync(path.join(ROOT, 'docs/agents.md'), 'utf8');
  const promptsMd = fs.readFileSync(path.join(ROOT, 'prompts.md'),     'utf8');
  const systemContext = [claudeMd, agentsMd, promptsMd].join('\n\n---\n\n');

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    system: systemContext,
    messages: [{ role: 'user', content: `Run DUE DILIGENCE for: ${input}` }],
  });

  let raw = response.content[0].text.trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  return extractLastJson(raw);
}

module.exports = { runAgent, streamAgentEvents, AGENTS, streamIntakeEvents, INTAKE_AGENTS };

if (require.main === module) {
  const input = process.argv[2] || 'Stripe';
  runAgent(input)
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(err => { console.error('Error:', err.message); process.exit(1); });
}
