import fs from "fs-extra";
import matter from "gray-matter";
import MarkdownIt from "markdown-it";
import { format } from "date-fns";

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

const SRC = "public/privacy/privacy.md";
const DEST = "public/privacy/index.html";

// Map a few common Liquid date tokens -> date-fns tokens
function liquidToDateFns(pattern) {
  // supports %Y, %m, %d, %B, %b
  return pattern
    .replace(/%Y/g, "yyyy")
    .replace(/%m/g, "MM")
    .replace(/%d/g, "dd")
    .replace(/%B/g, "LLLL")
    .replace(/%b/g, "LLL");
}

function replaceLiquidDates(s) {
  const now = new Date();

  // {{ site.time | date: "%Y-%m-%d" }}
  s = s.replace(/\{\{\s*site\.time\s*\|\s*date:\s*"([^"]+)"\s*\}\}/g, (_m, p1) =>
    format(now, liquidToDateFns(p1))
  );

  // {{ "now" | date: "%B %d, %Y" }}
  s = s.replace(/\{\{\s*"now"\s*\|\s*date:\s*"([^"]+)"\s*\}\}/g, (_m, p1) =>
    format(now, liquidToDateFns(p1))
  );

  return s;
}

const raw = await fs.readFile(SRC, "utf8");
const { content, data } = matter(raw); // strips --- front-matter ---
const mdWithDates = replaceLiquidDates(content);
const bodyHtml = md.render(mdWithDates);

const pageTitle = data.title || "Privacy Policy";

const wrapped = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Mindful – ${pageTitle}</title>
  <meta name="description" content="Privacy policy for Mindful Bookmarks." />
  <link rel="canonical" href="https://mindfulbookmarks.com/privacy" />
  <link rel="icon" href="/favicon.ico" />
  <style>
    :root { color-scheme: light dark; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; }
    main { max-width: 800px; margin: 48px auto; padding: 0 16px; line-height: 1.65; }
    h1 { font-size: 2rem; margin: 0 0 .75rem; }
    h2 { margin-top: 2rem; font-size: 1.375rem; }
    h3 { margin-top: 1.25rem; font-size: 1.125rem; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    a { text-decoration: underline; }
    strong { font-weight: 600; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5rem 0;
      font-size: 0.95rem;
    }

    th, td {
      border: 1px solid #ccc;
      padding: 0.6rem 0.8rem;
      text-align: left;
      vertical-align: top;
    }

    th {
      background: rgba(0,0,0,0.04);
      font-weight: 600;
    }

    @media (prefers-color-scheme: dark) {
      th, td { border-color: #333; }
      th { background: rgba(255,255,255,0.05); }
    }
  </style>
</head>
<body>
  <main>
    ${bodyHtml}
  </main>
</body>
</html>`;

await fs.outputFile(DEST, wrapped);
console.log("privacy.md → public/privacy/index.html");
