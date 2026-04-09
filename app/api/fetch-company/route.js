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

function extractFacts(html) {
  const facts = [];

  const title = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
  if (title) facts.push(`Page title: ${title[1].trim()}`);

  const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i)
            || html.match(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+name=["']description["']/i);
  if (desc) facts.push(`Meta description: ${desc[1].trim()}`);

  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,300})["']/i);
  if (ogDesc && !desc) facts.push(`OG description: ${ogDesc[1].trim()}`);

  const h1 = html.match(/<h1[^>]*>([\s\S]{1,300}?)<\/h1>/i);
  if (h1) facts.push(`Main heading: ${stripHtml(h1[1]).slice(0, 200).trim()}`);

  return facts.filter(f => f.length > 15);
}

async function tryFetch(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;
    const html = await res.text();
    const text = stripHtml(html).slice(0, 4000);
    const facts = extractFacts(html);
    return { website_text: text, source_url: res.url || url, extracted_facts: facts };
  } catch {
    return null;
  }
}

function resolveUrls(input) {
  const trimmed = input.trim();

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return [trimmed];
  }

  const clean = trimmed.toLowerCase().replace(/^www\./, '').replace(/\s+/g, '');

  if (clean.includes('.')) {
    return [`https://${clean}`, `https://www.${clean}`];
  }

  return [
    `https://www.${clean}.com`,
    `https://${clean}.com`,
    `https://${clean}.io`,
    `https://${clean}.ai`,
    `https://${clean}.co`,
  ];
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'Invalid request', website_text: '', source_url: '', extracted_facts: [] },
      { status: 400 }
    );
  }

  const { input } = body;
  if (!input || typeof input !== 'string' || !input.trim()) {
    return Response.json(
      { error: 'Missing input', website_text: '', source_url: '', extracted_facts: [] },
      { status: 400 }
    );
  }

  const urls = resolveUrls(input.trim());
  let result = null;

  for (const url of urls) {
    result = await tryFetch(url);
    if (result && result.website_text.length > 100) break;
  }

  if (!result || result.website_text.length < 80) {
    return Response.json({
      website_text: '',
      source_url: '',
      extracted_facts: [],
      error: 'Could not retrieve sufficient data from company website',
    });
  }

  return Response.json(result);
}
