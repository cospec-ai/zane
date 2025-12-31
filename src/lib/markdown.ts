import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

async function downloadImages(
  dir: string,
  markdown: string,
  headers?: Record<string, string>
) {
  const matches = [...markdown.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g)];
  if (!matches.length) return markdown;

  const imagesDir = path.join(dir, "images");
  await mkdir(imagesDir, { recursive: true });
  let updated = markdown;

  for (const match of matches) {
    const [full, alt, url] = [match[0], match[1] ?? "", match[2]];
    if (!url) continue;

    try {
      const filename = path.basename(new URL(url).pathname).replace(/[^a-zA-Z0-9.-]/g, "_") || `img-${Date.now()}`;
      const dest = path.join(imagesDir, filename);
      
      const res = await fetch(url, { headers: { ...headers, "User-Agent": "Zane" } });
      if (res.ok) {
        await writeFile(dest, Buffer.from(await res.arrayBuffer()));
        updated = updated.replace(full, `![${alt}](${path.relative(dir, dest)})`);
      }
    } catch (e) {
      console.error(`[markdown] image download failed: ${url}`);
    }
  }
  return updated;
}

export async function sanitizeMarkdown(
  dir: string,
  markdown: string,
  options?: { headers?: Record<string, string> }
) {
  return downloadImages(dir, markdown, options?.headers);
}
