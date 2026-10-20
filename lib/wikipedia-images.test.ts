import { afterEach, describe, expect, it, vi } from "vitest";
import { findWikipediaImages } from "./wikipedia-images";

vi.mock("server-only", () => ({}));
afterEach(() => vi.useRealTimers());

const imageUrl = "https://upload.wikimedia.org/wikipedia/commons/a/ab/Neuron.svg";
const pageUrl = "https://en.wikipedia.org/wiki/Neuron";
const page = { title: "Neuron", fullurl: pageUrl, extract: "A nerve cell.", original: { source: imageUrl } };
const apiResponse = (value: object) => Response.json({ query: { pages: { "1": value } } });
const imageResponse = () => new Response(null, { headers: { "content-type": "image/svg+xml" } });

describe("Wikipedia chapter images", () => {
  it("uses chapter title and objectives, verifies URLs, and deduplicates results", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (url) => String(url).includes("/w/api.php") ? apiResponse(page) : imageResponse());
    expect(await findWikipediaImages("Neurons", ["Understand nerve cells"], request)).toEqual([
      { title: "Neuron", imageUrl, pageUrl, caption: "A nerve cell." },
    ]);
    const searches = request.mock.calls.filter(([url]) => String(url).includes("/w/api.php"));
    expect(searches.map(([url]) => new URL(String(url)).searchParams.get("gsrsearch"))).toEqual(["Neurons", "Understand nerve cells"]);
    expect(request).toHaveBeenCalledWith(imageUrl, expect.objectContaining({ method: "HEAD", signal: expect.any(AbortSignal) }));
  });

  it("prefers the 900px thumbnail and falls back to a ranged GET when HEAD fails", async () => {
    const thumbnail = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Neuron.svg/900px-Neuron.svg.png";
    const request = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (String(url).includes("/w/api.php")) return apiResponse({ ...page, thumbnail: { source: thumbnail } });
      return init?.method === "HEAD" ? new Response(null, { status: 405 }) : imageResponse();
    });
    expect((await findWikipediaImages("Neuron", [], request))[0].imageUrl).toBe(thumbnail);
    expect(request).toHaveBeenCalledWith(thumbnail, expect.objectContaining({ headers: expect.objectContaining({ Range: "bytes=0-0" }) }));
    expect(request.mock.calls.some(([url]) => url === imageUrl)).toBe(false);
  });

  it.each(["api", "file path"])("recovers a broken URL through Commons %s", async (recovery) => {
    const recovered = recovery === "api" ? "https://upload.wikimedia.org/wikipedia/commons/b/bb/Recovered.svg" : "https://commons.wikimedia.org/wiki/Special:FilePath/Neuron.svg";
    const request = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).startsWith("https://en.wikipedia.org/w/api.php")) return apiResponse(page);
      if (String(url).startsWith("https://commons.wikimedia.org/w/api.php")) return apiResponse({ imageinfo: recovery === "api" ? [{ url: recovered }] : [] });
      return url === recovered ? imageResponse() : new Response(null, { status: 404 });
    });
    expect((await findWikipediaImages("Neuron", [], request))[0]?.imageUrl).toBe(recovered);
  });

  it.each(["missing", "malformed", "network", "http", "not an image", "untrusted URL"])("returns no candidates for %s", async (failure) => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (failure === "network") throw new Error("offline");
      if (failure === "http") return new Response(null, { status: 429 });
      if (failure === "missing") return Response.json({});
      if (failure === "malformed") return Response.json({ query: { pages: [] } });
      if (String(url).startsWith("https://en.wikipedia.org/w/api.php")) return apiResponse({ ...page, original: { source: failure === "untrusted URL" ? "https://example.com/image.png" : imageUrl } });
      if (String(url).includes("/w/api.php")) return Response.json({});
      return new Response(null, { headers: { "content-type": "text/html" } });
    });
    expect(await findWikipediaImages("Neuron", [], request)).toEqual([]);
    expect(request.mock.calls.some(([url]) => String(url).startsWith("https://example.com"))).toBe(false);
  });

  it("aborts all requests at the shared 8-second deadline, even if fetch ignores abort", async () => {
    vi.useFakeTimers();
    const request = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    const result = findWikipediaImages("Neuron", ["Nerve cells"], request);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await result).toEqual([]);
    expect(request.mock.calls).toHaveLength(2);
    for (const [, init] of request.mock.calls) expect(init?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
