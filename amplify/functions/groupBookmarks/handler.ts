// amplify/functions/group-bookmarks/handler.ts
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import OpenAI from "openai";
import { env } from "$amplify/env/groupBookmarksFunc";

type LlmGroupingBookmark = {
  id: string;
  title: string;
  url: string;
  description?: string | null;
};

type GroupingInput = {
  bookmarks: LlmGroupingBookmark[];
  purposes: string[];
};

type GroupResult = {
  id: string;
  name: string;
  description?: string;
  bookmarkIds: string[];
};

type GroupingLLMResponse = {
  groups: GroupResult[];
};

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

const MODEL = "gpt-4.1-mini"; // cheap-ish, good enough
const MAX_ITEMS = 100;
const MAX_DESC_CHARS = 200;
const MAX_OUTPUT_TOKENS = 800;

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    if (!event.body) {
      return corsResponse(400, "Missing body");
    }

    const input = JSON.parse(event.body) as GroupingInput;

    if (!input.bookmarks || input.bookmarks.length === 0) {
      return corsJson({ groups: [] });
    }

    const bookmarks = input.bookmarks.slice(0, MAX_ITEMS).map((b) => ({
      ...b,
      description: b.description
        ? b.description.slice(0, MAX_DESC_CHARS)
        : undefined,
    }));

    const systemPrompt = `
You group browser bookmarks into topic-based collections for a productivity app.

Return STRICT JSON only:

type GroupResult = {
  id: string;           // slug-like, no spaces
  name: string;         // short human-readable label
  description?: string; // optional
  bookmarkIds: string[];// bookmark.id values
};

type GroupingLLMResponse = {
  groups: GroupResult[];
};

Rules:
- Use about 3–8 groups total.
- Every bookmark must be in at least one group.
- Do not invent bookmark ids.
- Prefer concise descriptive group names.
- No commentary or explanation, JSON only.
`.trim();

    const userPrompt = buildUserPrompt(bookmarks, input.purposes);

    const completion = await openai.responses.create({
      model: MODEL,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_output_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.2,
    });

    const msg = completion.output[0]?.content[0];
    if (!msg || msg.type !== "output_text") {
      throw new Error("Unexpected response format from OpenAI");
    }

    const parsed = JSON.parse(msg.text) as GroupingLLMResponse;
    const groups = sanitizeGroups(parsed.groups, bookmarks);

    return corsJson({ groups });
  } catch (err) {
    console.error("groupBookmarks error:", err);

    // Fallback: single catch-all group so UI still works
    try {
      if (event.body) {
        const input = JSON.parse(event.body) as GroupingInput;
        if (input.bookmarks?.length) {
          return corsJson({
            groups: [
              {
                id: "imported",
                name: "Imported",
                description: "All imported bookmarks",
                bookmarkIds: input.bookmarks.map((b) => b.id),
              },
            ],
          });
        }
      }
    } catch {
      // ignore
    }

    return corsResponse(500, "Error grouping bookmarks");
  }
};

function buildUserPrompt(
  bookmarks: LlmGroupingBookmark[],
  purposes: string[]
): string {
  const purposesLine =
    purposes.length > 0
      ? `User says these bookmarks are for: ${purposes.join(", ")}.`
      : "No specific user purpose provided.";

  const lines = bookmarks.map(
    (b, index) =>
      `${index + 1}. id=${b.id}
   title="${b.title}"
   url=${b.url}
   description=${b.description ?? "none"}`
  );

  return `
${purposesLine}

Here is the list of bookmarks:

${lines.join("\n")}

Return a JSON object with exactly this shape:

{
  "groups": GroupResult[]
}
`.trim();
}

function sanitizeGroups(
  groups: GroupResult[] | undefined,
  bookmarks: LlmGroupingBookmark[]
): GroupResult[] {
  const validIds = new Set(bookmarks.map((b) => b.id));

  if (!groups || !Array.isArray(groups)) {
    return [
      {
        id: "imported",
        name: "Imported",
        description: "All imported bookmarks",
        bookmarkIds: [...validIds],
      },
    ];
  }

  const cleaned = groups.map((g) => {
    const bookmarkIds = (g.bookmarkIds || []).filter((id) =>
      validIds.has(id)
    );
    const id =
      g.id ||
      g.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    return { ...g, id, bookmarkIds };
  });

  const covered = new Set(cleaned.flatMap((g) => g.bookmarkIds));
  const missing = [...validIds].filter((id) => !covered.has(id));

  if (missing.length > 0) {
    cleaned.push({
      id: "ungrouped",
      name: "Ungrouped",
      description: "Bookmarks that did not fit other groups",
      bookmarkIds: missing,
    });
  }

  return cleaned;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*", // Tighten this later
    "Access-Control-Allow-Headers": "*",
  };
}

function corsJson(body: GroupingLLMResponse) {
  return {
    statusCode: 200,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function corsResponse(statusCode: number, message: string) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: message,
  };
}