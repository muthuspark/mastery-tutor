import "server-only";

import { z } from "zod";

export type WikipediaImage = {
  title: string;
  imageUrl: string;
  pageUrl: string;
  caption: string;
};

const pagesSchema = z.object({
  query: z.object({
    pages: z.record(z.string(), z.object({
      title: z.string().optional(),
      fullurl: z.string().optional(),
      extract: z.string().optional(),
      thumbnail: z.object({ source: z.string() }).optional(),
      original: z.object({ source: z.string() }).optional(),
      imageinfo: z.array(z.object({ url: z.string() })).optional(),
    })),
  }).optional(),
});

function trustedUrl(value: string, hosts: string[]) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && hosts.includes(url.hostname);
  } catch {
    return false;
  }
}

/** Each chapter lookup shares one deadline, including verification and recovery. */
export async function findWikipediaImages(
  title: string,
  objectives: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<WikipediaImage[]> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<WikipediaImage[]>((resolve) => {
    timer = setTimeout(() => { controller.abort(); resolve([]); }, 8_000);
  });
  const request = (url: string, init?: RequestInit) => fetchImpl(url, {
    ...init,
    signal: controller.signal,
    headers: { "User-Agent": "MasteryTutor/0.1 (educational chapter images)", ...init?.headers },
  });

  async function firstPage(host: string, params: Record<string, string>) {
    const response = await request(`https://${host}/w/api.php?${new URLSearchParams({ action: "query", format: "json", ...params })}`);
    if (!response.ok) return undefined;
    const data = pagesSchema.parse(await response.json());
    return Object.values(data.query?.pages ?? {})[0];
  }

  async function isImage(url: string) {
    if (!trustedUrl(url, ["upload.wikimedia.org", "commons.wikimedia.org"])) return false;
    for (const init of [{ method: "HEAD" }, { headers: { Range: "bytes=0-0" } }]) {
      try {
        const response = await request(url, init);
        const valid = response.ok && response.headers.get("content-type")?.startsWith("image/");
        await response.body?.cancel();
        if (valid) return true;
      } catch {
        if (controller.signal.aborted) return false;
      }
    }
    return false;
  }

  async function recover(url: string) {
    if (!trustedUrl(url, ["upload.wikimedia.org", "commons.wikimedia.org"])) return null;
    const parts = new URL(url).pathname.split("/").map(decodeURIComponent);
    const file = parts.includes("thumb") ? parts.at(-2) : parts.at(-1);
    if (!file) return null;
    const page = await firstPage("commons.wikimedia.org", {
      titles: `File:${file}`, prop: "imageinfo", iiprop: "url|mime",
    });
    const apiUrl = page?.imageinfo?.[0]?.url;
    if (apiUrl && await isImage(apiUrl)) return apiUrl;
    const fileUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}`;
    return await isImage(fileUrl) ? fileUrl : null;
  }

  async function search(query: string): Promise<WikipediaImage | null> {
    try {
      const page = await firstPage("en.wikipedia.org", {
        generator: "search", gsrsearch: query, gsrlimit: "1",
        prop: "pageimages|extracts|info", piprop: "original|thumbnail", pithumbsize: "900",
        exintro: "1", explaintext: "1", exchars: "600", inprop: "url", redirects: "1",
      });
      if (!page?.title || !page.fullurl || !trustedUrl(page.fullurl, ["en.wikipedia.org"])) return null;
      const urls = [...new Set([page.thumbnail?.source, page.original?.source].filter((url): url is string => Boolean(url)))];
      for (const imageUrl of urls) {
        if (await isImage(imageUrl)) return { title: page.title, imageUrl, pageUrl: page.fullurl, caption: page.extract || page.title };
      }
      const recovered = urls.length ? await recover(urls.at(-1)!) : null;
      return recovered ? { title: page.title, imageUrl: recovered, pageUrl: page.fullurl, caption: page.extract || page.title } : null;
    } catch {
      return null;
    }
  }

  try {
    const queries = [...new Set([title, objectives.join("; ")].map((query) => query.trim()).filter(Boolean))];
    const lookup = Promise.all(queries.map(search)).then((results) => {
      const unique = new Map<string, WikipediaImage>();
      for (const result of results) if (result) unique.set(result.imageUrl, result);
      return [...unique.values()].slice(0, 2);
    });
    return await Promise.race([lookup, deadline]);
  } finally {
    clearTimeout(timer!);
    controller.abort();
  }
}
