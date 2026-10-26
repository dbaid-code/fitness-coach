// Mailpit (local auth emails) helpers.
export async function latestEmailTo(email: string, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const list = (await res.json()) as { messages?: Array<{ ID: string }> };
    const id = list.messages?.[0]?.ID;
    if (id) {
      const msg = (await (await fetch(`http://127.0.0.1:54324/api/v1/message/${id}`)).json()) as { HTML: string };
      return msg.HTML;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No email to ${email}`);
}

export function extractLink(html: string): string {
  const m = html.match(/href="([^"]*\/auth\/confirm[^"]*)"/);
  if (!m) throw new Error('No confirm link in email');
  return m[1]!.replace(/&amp;/g, '&');
}
