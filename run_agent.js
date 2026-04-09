const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

// Finds the last complete top-level JSON object in a string by scanning
// backwards from the last '}' to its matching '{'.
// This avoids the greedy-regex trap of merging multiple JSON blocks.
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

async function runAgent(input, apiKey = null) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is not configured on the server');
  }

  const client = new Anthropic({ apiKey: key });

  const claudeMd  = fs.readFileSync(path.join(ROOT, 'claude.md'),      'utf8');
  const agentsMd  = fs.readFileSync(path.join(ROOT, 'docs/agents.md'), 'utf8');
  const promptsMd = fs.readFileSync(path.join(ROOT, 'prompts.md'),     'utf8');

  const systemContext = [claudeMd, agentsMd, promptsMd].join('\n\n---\n\n');

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    system: systemContext,
    messages: [
      { role: 'user', content: `Run DUE DILIGENCE for: ${input}` },
    ],
  });

  let raw = response.content[0].text.trim();

  // Strip markdown fences
  raw = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const parsed = extractLastJson(raw);

  return parsed;
}

// Agent detection patterns — matched against the accumulating stream text
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

// Async generator — yields progress events then a final { type:'done', result }
async function* streamAgentEvents(input, apiKey = null) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured on the server');

  const client = new Anthropic({ apiKey: key });

  const claudeMd  = fs.readFileSync(path.join(ROOT, 'claude.md'),      'utf8');
  const agentsMd  = fs.readFileSync(path.join(ROOT, 'docs/agents.md'), 'utf8');
  const promptsMd = fs.readFileSync(path.join(ROOT, 'prompts.md'),     'utf8');
  const systemContext = [claudeMd, agentsMd, promptsMd].join('\n\n---\n\n');

  let fullText = '';
  const completed = new Set();

  const stream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    system: systemContext,
    messages: [{ role: 'user', content: `Run DUE DILIGENCE for: ${input}` }],
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      fullText += chunk.delta.text;
      for (const agent of AGENTS) {
        if (!completed.has(agent.key) && agent.pattern.test(fullText)) {
          completed.add(agent.key);
          yield { type: 'agent', key: agent.key, label: agent.label };
        }
      }
    }
  }

  let raw = fullText.trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  const parsed = extractLastJson(raw);

  yield { type: 'done', result: parsed };
}

// Intake agent detection patterns
const INTAKE_AGENTS = [
  { key: 'scouter',          label: 'Scouter',          pattern: /"startup_name"/ },
  { key: 'source_checker',   label: 'Source Checker',   pattern: /"claims_verified"/ },
  { key: 'signal_extractor', label: 'Signal Extractor', pattern: /"unfair_advantage"/ },
  { key: 'thesis_fit',       label: 'Thesis Fit',       pattern: /"uv_fit"/ },
];

// Async generator for INTAKE mode — 4 agents, grounded data only
async function* streamIntakeEvents(input, apiKey = null, groundData = null) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured on the server');

  const client = new Anthropic({ apiKey: key });

  const claudeMd  = fs.readFileSync(path.join(ROOT, 'claude.md'),      'utf8');
  const agentsMd  = fs.readFileSync(path.join(ROOT, 'docs/agents.md'), 'utf8');
  const promptsMd = fs.readFileSync(path.join(ROOT, 'prompts.md'),     'utf8');
  const systemContext = [claudeMd, agentsMd, promptsMd].join('\n\n---\n\n');

  // Build grounded prompt — LLM receives only fetched data, no prior knowledge allowed
  let userContent;
  if (groundData && groundData.website_text && groundData.website_text.length > 0) {
    const facts = (groundData.extracted_facts || []).map(f => `- ${f}`).join('\n') || '- none extracted';
    userContent =
`Run INTAKE for: ${input}

GROUNDED DATA — use ONLY the content below. Do NOT use prior knowledge about this company.

Source: ${groundData.source_url || 'unknown'}

Website Text:
---
${groundData.website_text.slice(0, 3500)}
---

Extracted Facts:
${facts}`;
  } else {
    userContent = `Run INTAKE for: ${input}

WARNING: No ground data was provided. Return the insufficient data error JSON immediately.`;
  }

  let fullText = '';
  const completed = new Set();

  const stream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 2048,
    system: systemContext,
    messages: [{ role: 'user', content: userContent }],
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      fullText += chunk.delta.text;
      for (const agent of INTAKE_AGENTS) {
        if (!completed.has(agent.key) && agent.pattern.test(fullText)) {
          completed.add(agent.key);
          yield { type: 'agent', key: agent.key, label: agent.label };
        }
      }
    }
  }

  let raw = fullText.trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  const parsed = extractLastJson(raw);

  yield { type: 'done', result: parsed };
}

module.exports = { runAgent, streamAgentEvents, AGENTS, streamIntakeEvents, INTAKE_AGENTS };

if (require.main === module) {
  const input = process.argv[2] || 'Stripe';
  runAgent(input)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
