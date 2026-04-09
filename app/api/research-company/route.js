function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract actual destination URLs from DuckDuckGo HTML redirect links (uddg= param)
function parseDdgUrls(html) {
  const urls = [];
  const regex = /uddg=([^&"'\s>]+)/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const url = decodeURIComponent(match[1]);
      if (url.startsWith('http') && !url.includes('duckduckgo.com')) {
        urls.push(url);
      }
    } catch {}
  }
  return [...new Set(urls)];
}

const SKIP_DOMAINS = [
  'linkedin.com', 'facebook.com', 'twitter.com', 'x.com',
  'instagram.com', 'youtube.com', 'reddit.com',
];

function shouldSkip(url) {
  try {
    const hostname = new URL(url).hostname;
    return SKIP_DOMAINS.some(d => hostname.includes(d));
  } catch {
    return true;
  }
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function searchDdg(query) {
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { headers: HEADERS, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    return parseDdgUrls(await res.text());
  } catch {
    return [];
  }
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(7000),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return null;
    const text = stripHtml(await res.text()).slice(0, 2000);
    return text.length > 80 ? { url: res.url || url, text } : null;
  } catch {
    return null;
  }
}

// Direct website fetch (same pattern as fetch-company route)
async function tryDirectFetch(company) {
  const clean = company.toLowerCase().replace(/^www\./, '').replace(/\s+/g, '');
  const urls = clean.includes('.')
    ? [`https://${clean}`, `https://www.${clean}`]
    : [`https://www.${clean}.com`, `https://${clean}.com`, `https://${clean}.io`, `https://${clean}.ai`];
  for (const url of urls) {
    const page = await fetchPage(url);
    if (page) return { query: 'company website', url: page.url, text: page.text };
  }
  return null;
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { company } = body;
  if (!company || typeof company !== 'string' || !company.trim()) {
    return Response.json({ error: 'Missing company' }, { status: 400 });
  }

  const q = company.trim();

  // 5 targeted search queries covering the key DD dimensions
  const queries = [
    `"${q}" startup company overview`,
    `"${q}" founder CEO team background`,
    `"${q}" funding raised investors`,
    `"${q}" product technology`,
    `"${q}" news 2024 OR 2025`,
  ];

  // Run all 5 DDG searches concurrently
  const searchResults = await Promise.all(queries.map(searchDdg));

  // Deduplicate candidate URLs across all searches before fetching
  const seenUrls = new Set();
  const candidates = searchResults.map(urls =>
    urls.filter(url => {
      if (seenUrls.has(url) || shouldSkip(url)) return false;
      seenUrls.add(url);
      return true;
    }).slice(0, 3)
  );

  // Fetch company website + one page per search query, all concurrently
  const [directResult, ...searchPageResults] = await Promise.all([
    tryDirectFetch(q),
    ...candidates.map(async (urls, i) => {
      for (const url of urls) {
        const page = await fetchPage(url);
        if (page) return { query: queries[i], url: page.url, text: page.text };
      }
      return null;
    }),
  ]);

  const sources = [directResult, ...searchPageResults].filter(Boolean);

  const aggregated_text = sources
    .map((s, i) => `[Source ${i + 1}: ${s.url}]\n${s.text}`)
    .join('\n\n---\n\n');

  return Response.json({ sources, aggregated_text, source_count: sources.length });
}
