'use client';

import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'landing' | 'search' | 'fetching' | 'running' | 'results';
type AgentStatus = 'pending' | 'active' | 'done';
type Mode = 'dd' | 'intake';

type Signal = { value: string; confidence: number; source: string };

type AnalysisResult = {
  signals: Record<string, Signal>;
  decision: string;
  reasoning: string[];
};

type IntakeResult = {
  company?: string;
  summary?: string;
  signals?: Record<string, string>;
  quick_take?: string;
  confidence?: number;
  error?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const AGENT_LIST = [
  { key: 'founder',       label: 'Founder Agent' },
  { key: 'product',       label: 'Product Agent' },
  { key: 'traction',      label: 'Traction Agent' },
  { key: 'market',        label: 'Market Agent' },
  { key: 'risk',          label: 'Risk Agent' },
  { key: 'falsification', label: 'Falsification Agent' },
  { key: 'thesis',        label: 'Thesis Fit Agent' },
  { key: 'decision',      label: 'Investment Decision' },
];

const INTAKE_AGENT_LIST = [
  { key: 'scouter',          label: 'Scouter' },
  { key: 'source_checker',   label: 'Source Checker' },
  { key: 'signal_extractor', label: 'Signal Extractor' },
  { key: 'thesis_fit',       label: 'Thesis Fit' },
];

const SIGNAL_LABELS: Record<string, string> = {
  thesis_fit:           'Thesis Fit',
  origin_signal:        'Origin Signal',
  technical_depth:      'Technical Depth',
  institutional_signal: 'Institutional Signal',
  market_signal:        'Market Signal',
  timing_signal:        'Timing Signal',
};

const SIGNAL_DESCRIPTIONS: Record<string, string> = {
  thesis_fit:           'Alignment with fund focus',
  origin_signal:        'Where the company comes from (research, product, etc.)',
  technical_depth:      'Level of defensibility',
  institutional_signal: 'External validation (grants, accelerators)',
  market_signal:        'Evidence of demand',
  timing_signal:        'Stage of development',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(c: number) { return `${((c ?? 0) * 100).toFixed(0)}%`; }
function bar(c: number) { return c >= 0.6 ? '#4ade80' : c >= 0.3 ? '#facc15' : '#f87171'; }

function initStatuses(list: { key: string }[], firstActive = false): Record<string, AgentStatus> {
  return Object.fromEntries(list.map((a, i) => [a.key, i === 0 && firstActive ? 'active' : 'pending']));
}

function mapDecision(decision: string): string {
  const d = (decision ?? '').toLowerCase();
  if (d === 'invest' || d === 'advance' || d.includes('worth')) return 'Worth exploring';
  if (d === 'pass' || d.includes('low')) return 'Low priority';
  return decision;
}

function isUrl(s: string): boolean {
  return typeof s === 'string' && (s.startsWith('http://') || s.startsWith('https://'));
}

function hostOf(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const S = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 24px',
  } as React.CSSProperties,

  input: {
    width: '100%',
    padding: '11px 14px',
    background: '#1a1a1a',
    border: '1px solid #2e2e2e',
    borderRadius: 7,
    color: '#e0e0e0',
    fontSize: 14,
    outline: 'none',
    fontFamily: 'monospace',
    boxSizing: 'border-box',
  } as React.CSSProperties,

  btnPrimary: {
    padding: '11px 28px',
    background: '#2563eb',
    border: 'none',
    borderRadius: 7,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'monospace',
    width: '100%',
  } as React.CSSProperties,

  btnGhost: {
    background: 'none',
    border: 'none',
    color: '#555',
    fontSize: 13,
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'monospace',
  } as React.CSSProperties,

  label: {
    fontSize: 10,
    color: '#444',
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    marginBottom: 10,
    display: 'block',
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function WhySignals() {
  return (
    <div style={{
      background: '#0d0d0d',
      border: '1px solid #1a1a1a',
      borderRadius: 8,
      padding: '16px 20px',
      marginTop: 20,
    }}>
      <div style={{ fontSize: 10, color: '#333', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>
        Why these signals?
      </div>
      <p style={{ fontSize: 12, color: '#3a3a3a', lineHeight: 1.7, margin: '0 0 8px' }}>
        These signals capture key dimensions of early-stage startups:
      </p>
      <ul style={{ margin: 0, paddingLeft: 16 }}>
        {[
          'founder/context (origin)',
          'defensibility (technical depth)',
          'validation (institutional and market)',
          'timing (stage)',
          'strategic alignment (thesis fit)',
        ].map(item => (
          <li key={item} style={{ fontSize: 12, color: '#333', marginBottom: 3, lineHeight: 1.6 }}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function DDSignalCard({ signalKey, signal }: { signalKey: string; signal: Signal }) {
  const link = isUrl(signal.source) ? signal.source : null;
  return (
    <div style={{ background: '#161616', border: '1px solid #1e1e1e', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, color: '#444', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
        {SIGNAL_LABELS[signalKey] ?? signalKey}
      </div>
      <div style={{ fontSize: 11, color: '#333', marginBottom: 8, lineHeight: 1.4 }}>
        {SIGNAL_DESCRIPTIONS[signalKey] ?? ''}
      </div>
      <div style={{ fontSize: 14, marginBottom: 10, minHeight: 20, color: '#e0e0e0' }}>
        {signal.value || '—'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 3, background: '#222', borderRadius: 2 }}>
          <div style={{ width: pct(signal.confidence), height: '100%', background: bar(signal.confidence), borderRadius: 2 }} />
        </div>
        <span style={{ fontSize: 11, color: '#555', minWidth: 28, textAlign: 'right' }}>
          {pct(signal.confidence)}
        </span>
      </div>
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, color: '#2a5a4a', marginTop: 6, display: 'block', textDecoration: 'underline' }}
        >
          {hostOf(link)}
        </a>
      )}
    </div>
  );
}

function IntakeSignalCard({ signalKey, value }: { signalKey: string; value: string }) {
  return (
    <div style={{ background: '#161616', border: '1px solid #1e1e1e', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, color: '#444', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
        {SIGNAL_LABELS[signalKey] ?? signalKey}
      </div>
      <div style={{ fontSize: 11, color: '#333', marginBottom: 8, lineHeight: 1.4 }}>
        {SIGNAL_DESCRIPTIONS[signalKey] ?? ''}
      </div>
      <div style={{ fontSize: 14, color: '#e0e0e0', fontFamily: 'monospace' }}>
        {value || '—'}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const [step, setStep]               = useState<Step>('landing');
  const [company, setCompany]         = useState('');
  const [error, setError]             = useState<string | null>(null);
  const [mode, setMode]               = useState<Mode>('dd');
  const [sourceUrl, setSourceUrl]     = useState<string>('');
  const [result, setResult]           = useState<AnalysisResult | null>(null);
  const [intakeResult, setIntakeResult] = useState<IntakeResult | null>(null);
  const [statuses, setStatuses]       = useState<Record<string, AgentStatus>>(initStatuses(AGENT_LIST));

  // ── Run analysis ────────────────────────────────────────────────────────────
  async function startAnalysis(selectedMode: Mode) {
    const q = company.trim();
    if (!q) return;

    const agentList = selectedMode === 'intake' ? INTAKE_AGENT_LIST : AGENT_LIST;
    const agentKeys = agentList.map(a => a.key);

    setMode(selectedMode);
    setError(null);
    setResult(null);
    setIntakeResult(null);
    setSourceUrl('');

    // Intake: fetch company website before reasoning
    let groundData: { website_text: string; source_url: string; extracted_facts: string[]; error?: string } | null = null;
    if (selectedMode === 'intake') {
      setStep('fetching');
      try {
        const fetchRes = await fetch('/api/fetch-company', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: q }),
        });
        if (!fetchRes.ok) throw new Error('Fetch failed');
        groundData = await fetchRes.json();
        if (groundData?.source_url) setSourceUrl(groundData.source_url);
      } catch {
        setError('Could not retrieve company data. Try a direct URL (e.g. stripe.com).');
        setStep('search');
        return;
      }
    }
    // DD: no pre-fetch — Claude calls web_search tool autonomously during analysis

    setStatuses(initStatuses(agentList, true));
    setStep('running');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: q,
          mode: selectedMode,
          ...(groundData && { ground_data: groundData }),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Request failed');
      }

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: { type: string; key?: string; result?: AnalysisResult & IntakeResult; message?: string };
          try { event = JSON.parse(raw); } catch { continue; }

          if (event.type === 'agent' && event.key) {
            setStatuses(prev => {
              const idx  = agentKeys.indexOf(event.key!);
              const next = { ...prev, [event.key!]: 'done' as AgentStatus };
              if (idx + 1 < agentKeys.length) next[agentKeys[idx + 1]] = 'active';
              return next;
            });
          } else if (event.type === 'done' && event.result) {
            if (selectedMode === 'intake') {
              setIntakeResult(event.result as unknown as IntakeResult);
            } else {
              setResult(event.result as unknown as AnalysisResult);
            }
            setStatuses(Object.fromEntries(agentKeys.map(k => [k, 'done' as AgentStatus])));
            setTimeout(() => setStep('results'), 500);
          } else if (event.type === 'error') {
            throw new Error(event.message ?? 'Unknown error');
          }
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStep('search');
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // LANDING
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 'landing') {
    return (
      <main style={S.page}>
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <span style={{ ...S.label, display: 'inline-block', marginBottom: 20 }}>
            Unconventional Ventures
          </span>
          <h1 style={{ fontSize: 34, fontWeight: 700, margin: '0 0 14px', lineHeight: 1.15, color: '#e8e8e8' }}>
            Company Intake
          </h1>
          <p style={{ color: '#555', fontSize: 14, lineHeight: 1.8, margin: '0 0 40px', maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
            This interface surfaces early-stage signals to assess whether a startup is worth deeper evaluation.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 44, textAlign: 'left', padding: '0 16px' }}>
            {[
              ['Thesis fit',        'Alignment with fund focus',                 '#c084fc'],
              ['Origin signal',     'Where the company comes from',              '#93c5fd'],
              ['Technical depth',   'Level of defensibility',                    '#4ade80'],
              ['Market signal',     'Evidence of demand',                        '#facc15'],
              ['Timing signal',     'Stage of development',                      '#fb923c'],
            ].map(([label, desc, color]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 5 }} />
                <div>
                  <span style={{ fontSize: 13, color: '#888' }}>{label}</span>
                  <span style={{ fontSize: 12, color: '#3a3a3a', marginLeft: 8 }}>{desc}</span>
                </div>
              </div>
            ))}
          </div>

          <button onClick={() => setStep('search')} style={S.btnPrimary}>
            Run Intake →
          </button>
        </div>
      </main>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SEARCH
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 'search') {
    return (
      <main style={S.page}>
        <div style={{ maxWidth: 440, width: '100%' }}>
          <button onClick={() => setStep('landing')} style={{ ...S.btnGhost, marginBottom: 28 }}>
            ← Back
          </button>
          <span style={S.label}>Company Intake</span>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', color: '#e8e8e8' }}>
            Analyze a Company
          </h2>
          <p style={{ color: '#555', fontSize: 13, margin: '0 0 28px', lineHeight: 1.6 }}>
            Enter a company name or URL. The system retrieves public data before running signal analysis.
          </p>

          {error && (
            <div style={{ background: '#1e0a0a', border: '1px solid #5a1a1a', borderRadius: 6, padding: '10px 14px', marginBottom: 18, color: '#f87171', fontSize: 13 }}>
              {error}
            </div>
          )}

          <input
            type="text"
            value={company}
            onChange={e => setCompany(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && startAnalysis('intake')}
            placeholder="e.g. Stripe, notion.so, Klarna…"
            autoFocus
            style={S.input}
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              onClick={() => startAnalysis('intake')}
              disabled={!company.trim()}
              style={{
                ...S.btnPrimary,
                flex: 1,
                opacity: company.trim() ? 1 : 0.35,
                background: '#163a28',
                border: '1px solid #2a5a3a',
              }}
            >
              Run Intake
            </button>
            <button
              onClick={() => startAnalysis('dd')}
              disabled={!company.trim()}
              style={{ ...S.btnPrimary, flex: 1, opacity: company.trim() ? 1 : 0.35 }}
            >
              Full Due Diligence
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <div style={{ flex: 1, fontSize: 11, color: '#2e2e2e', textAlign: 'center' }}>
              Fast · 4 agents · Directional
            </div>
            <div style={{ flex: 1, fontSize: 11, color: '#2e2e2e', textAlign: 'center' }}>
              Deep · 8 agents · Decision
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FETCHING
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 'fetching') {
    return (
      <main style={S.page}>
        <div style={{ maxWidth: 440, width: '100%' }}>
          <span style={S.label}>Intake · Data Retrieval</span>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px', color: '#e0e0e0' }}>
            Retrieving company data
          </h2>
          <p style={{ color: '#555', fontSize: 13, margin: '0 0 32px', fontStyle: 'italic' }}>
            "{company}"
          </p>
          <div style={{
            padding: '14px 16px', borderRadius: 8,
            border: '1px solid #1e3a5f', background: '#0f1a2e',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 13, color: '#93c5fd' }}>◉</span>
            <span style={{ fontSize: 13, color: '#93c5fd' }}>Fetching website content…</span>
          </div>
          <p style={{ fontSize: 11, color: '#2a2a2a', margin: '14px 0 0', textAlign: 'center' }}>
            No prior knowledge. Data only.
          </p>
        </div>
      </main>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RUNNING
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 'running') {
    const activeAgentList = mode === 'intake' ? INTAKE_AGENT_LIST : AGENT_LIST;
    return (
      <main style={S.page}>
        <div style={{ maxWidth: 440, width: '100%' }}>
          <span style={S.label}>{mode === 'intake' ? 'Intake' : 'Due Diligence'}</span>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px', color: '#e0e0e0' }}>
            Analyzing
          </h2>
          <p style={{ color: '#555', fontSize: 13, margin: '0 0 28px', fontStyle: 'italic' }}>
            "{company}"
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeAgentList.map(agent => {
              const s = statuses[agent.key];
              return (
                <div
                  key={agent.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '11px 16px',
                    borderRadius: 8,
                    border: `1px solid ${s === 'done' ? '#1a4a1a' : s === 'active' ? '#1e3a5f' : '#1e1e1e'}`,
                    background: s === 'done' ? '#0d1f0d' : s === 'active' ? '#0f1a2e' : '#111',
                  }}
                >
                  <span style={{
                    fontSize: 15,
                    color: s === 'done' ? '#4ade80' : s === 'active' ? '#93c5fd' : '#333',
                  }}>
                    {s === 'done' ? '✓' : s === 'active' ? '◉' : '○'}
                  </span>
                  <span style={{
                    fontSize: 13,
                    flex: 1,
                    color: s === 'done' ? '#4ade80' : s === 'active' ? '#93c5fd' : '#3a3a3a',
                  }}>
                    {agent.label}
                  </span>
                  {s === 'active' && <span style={{ fontSize: 11, color: '#3b5a8a' }}>running…</span>}
                  {s === 'done'   && <span style={{ fontSize: 11, color: '#1a5a1a' }}>done</span>}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RESULTS — INTAKE
  // ════════════════════════════════════════════════════════════════════════════
  if (mode === 'intake' && intakeResult) {
    const reset = (
      <button
        onClick={() => { setIntakeResult(null); setError(null); setStep('search'); }}
        style={{ ...S.btnGhost, marginBottom: 28 }}
      >
        ← New Analysis
      </button>
    );

    // Insufficient ground data
    if (intakeResult.error) {
      return (
        <main style={{ maxWidth: 620, margin: '56px auto', padding: '0 24px' }}>
          {reset}
          <span style={S.label}>Company Intake · Insufficient Data</span>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '12px 0 8px', color: '#e0e0e0' }}>{company}</h2>
          <div style={{ background: '#1a110a', border: '1px solid #4a2a0a', borderRadius: 8, padding: '20px', marginTop: 12 }}>
            <div style={{ fontSize: 13, color: '#fb923c', fontWeight: 600, marginBottom: 8 }}>
              Insufficient ground data
            </div>
            <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6 }}>
              The system could not retrieve enough website content to run a grounded intake.
              Try a direct URL such as{' '}
              <span style={{ fontFamily: 'monospace', color: '#444' }}>stripe.com</span>.
            </div>
            <div style={{ fontSize: 11, color: '#3a3a3a', marginTop: 14 }}>
              Confidence: {pct(intakeResult.confidence ?? 0.2)}
            </div>
          </div>
        </main>
      );
    }

    const isExploring = intakeResult.quick_take?.toLowerCase().includes('worth');
    const quickColor  = isExploring ? '#4ade80' : '#facc15';
    const quickBg     = isExploring ? '#0a2a1a' : '#1a150a';
    const quickBorder = isExploring ? '#1a5a3a' : '#4a3a0a';

    return (
      <main style={{ maxWidth: 680, margin: '56px auto', padding: '0 24px' }}>
        {reset}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <span style={{ fontSize: 10, color: '#333', letterSpacing: 2, textTransform: 'uppercase' }}>
            Company Intake
          </span>
          {sourceUrl && (
            <>
              <span style={{ color: '#222', fontSize: 10 }}>·</span>
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 10, color: '#2a4a3a', fontFamily: 'monospace', textDecoration: 'none' }}
              >
                {hostOf(sourceUrl)}
              </a>
            </>
          )}
        </div>

        {/* Company name */}
        <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 6px', color: '#e8e8e8' }}>
          {intakeResult.company || company}
        </h2>

        {/* Summary */}
        {intakeResult.summary && (
          <p style={{ color: '#555', fontSize: 13, margin: '0 0 24px', lineHeight: 1.7 }}>
            {intakeResult.summary}
          </p>
        )}

        {/* Quick take — most visible element */}
        <div style={{
          background: quickBg,
          border: `1px solid ${quickBorder}`,
          borderRadius: 10,
          padding: '16px 20px',
          marginBottom: 28,
        }}>
          <div style={{ fontSize: 10, color: '#2a2a2a', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
            Assessment
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: quickColor, lineHeight: 1.3 }}>
            {intakeResult.quick_take ?? '—'}
          </div>
        </div>

        {/* Early Signals */}
        <div style={{ fontSize: 10, color: '#444', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
          Early Signals
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 20 }}>
          {intakeResult.signals && Object.entries(intakeResult.signals).map(([key, value]) => (
            <IntakeSignalCard key={key} signalKey={key} value={value} />
          ))}
        </div>

        {/* Confidence */}
        <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 7, padding: '12px 16px', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: '#333', textTransform: 'uppercase', letterSpacing: 1 }}>
              Signal confidence
            </span>
            <span style={{ fontSize: 12, color: '#666' }}>{pct(intakeResult.confidence ?? 0)}</span>
          </div>
          <div style={{ height: 3, background: '#1e1e1e', borderRadius: 2 }}>
            <div style={{ width: pct(intakeResult.confidence ?? 0), height: '100%', background: bar(intakeResult.confidence ?? 0), borderRadius: 2 }} />
          </div>
        </div>

        <WhySignals />
      </main>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RESULTS — DUE DILIGENCE
  // ════════════════════════════════════════════════════════════════════════════
  const rawDecision  = result?.decision ?? '';
  const displayDecision = mapDecision(rawDecision);
  const isPositive   = displayDecision === 'Worth exploring';
  const decColor     = isPositive ? '#4ade80' : '#f87171';
  const decBg        = isPositive ? '#0a2a1a' : '#1e0a0a';
  const decBorder    = isPositive ? '#1a5a3a' : '#5a1a1a';

  // Quick take from first reasoning item
  const firstReasoning = result?.reasoning?.[0] ?? '';
  const quickTakeLine  = firstReasoning
    ? `${displayDecision} — ${firstReasoning.charAt(0).toLowerCase()}${firstReasoning.slice(1)}`
    : displayDecision;

  return (
    <main style={{ maxWidth: 820, margin: '56px auto', padding: '0 24px' }}>
      <button
        onClick={() => { setResult(null); setError(null); setStep('search'); }}
        style={{ ...S.btnGhost, marginBottom: 28 }}
      >
        ← New Analysis
      </button>

      {/* Header */}
      <span style={S.label}>Company Intake</span>

      {/* Company name */}
      <h2 style={{ fontSize: 24, fontWeight: 700, margin: '8px 0 6px', color: '#e8e8e8' }}>
        {company}
      </h2>

      {/* Quick take — most visible element */}
      <div style={{
        background: decBg,
        border: `1px solid ${decBorder}`,
        borderRadius: 10,
        padding: '16px 20px',
        margin: '16px 0 28px',
      }}>
        <div style={{ fontSize: 10, color: '#2a2a2a', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
          Assessment
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: decColor, lineHeight: 1.4 }}>
          {quickTakeLine}
        </div>
      </div>

      {/* Early Signals */}
      <div style={{ fontSize: 10, color: '#444', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
        Early Signals
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
        {result?.signals && Object.entries(result.signals).map(([key, signal]) => (
          <DDSignalCard key={key} signalKey={key} signal={signal} />
        ))}
      </div>

      {/* Additional reasoning items (2nd onward) */}
      {Array.isArray(result?.reasoning) && result!.reasoning.length > 1 && (
        <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 8, padding: '14px 18px', marginBottom: 4 }}>
          <div style={{ fontSize: 10, color: '#333', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>
            Supporting notes
          </div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {result!.reasoning.slice(1).map((line, i) => (
              <li key={i} style={{ fontSize: 13, color: '#555', marginBottom: 6, lineHeight: 1.6 }}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <WhySignals />
    </main>
  );
}
