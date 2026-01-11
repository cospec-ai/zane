import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
  "image/tiff": ".tiff",
  "image/x-icon": ".ico",
};

async function downloadImages(
  dir: string,
  markdown: string,
  headers?: Record<string, string>,
) {
  const matches = [
    ...markdown.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g),
  ];
  if (!matches.length) return markdown;

  const imagesDir = path.join(dir, "images");
  await mkdir(imagesDir, { recursive: true });
  let updated = markdown;

  for (const match of matches) {
    const [full, alt, url] = [match[0], match[1] ?? "", match[2]];
    if (!url) continue;

    try {
      const res = await fetch(url, {
        headers: { ...headers, "User-Agent": "Zane" },
      });
      if (!res.ok) continue;

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.startsWith("image/")) {
        console.error(`[markdown] skipping non-image: ${url} (${contentType})`);
        continue;
      }

      let filename =
        path.basename(new URL(url).pathname).replace(/[^a-zA-Z0-9.-]/g, "_") ||
        `img-${Date.now()}`;

      const mime = contentType.split(";")[0]?.trim().toLowerCase();
      if (!mime || !EXT[mime]) {
        console.error(
          `[markdown] skipping unknown mime: ${url} (${contentType})`,
        );
        continue;
      }

      filename = filename.replace(path.extname(filename), "") + EXT[mime];

      const dest = path.join(imagesDir, filename);
      await writeFile(dest, Buffer.from(await res.arrayBuffer()));
      updated = updated.replace(full, `![${alt}](${path.relative(dir, dest)})`);
    } catch (e) {
      console.error(`[markdown] image download failed: ${url}`);
    }
  }
  return updated;
}

export async function sanitizeMarkdown(
  dir: string,
  markdown: string,
  options?: { headers?: Record<string, string> },
) {
  return downloadImages(dir, markdown, options?.headers);
}
