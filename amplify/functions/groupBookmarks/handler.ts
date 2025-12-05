import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import OpenAI from "openai";

// Shared helpers (same as saveBookmarks)
import { withCorsAndErrors } from "../_shared/safe";
import { resp } from "../_shared/http";
import { evalCors } from "../_shared/cors"; // CorsPack type only
import { badRequest, serverError } from "../_shared/errors";

// ----------- OpenAI client -----------
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  // optional, but nicer error than a mysterious 401
  throw new Error("OPENAI_API_KEY env var is missing at runtime");
}
const openai = new OpenAI({ apiKey });


// ----------- Types that match llmGrouping.ts -----------
type RawSource = "bookmarks" | "tabs" | "history";
type RawItem = {
  id: string;
  name: string;
  url: string;
  source: RawSource;
  lastVisitedAt?: number;
};

type GroupingInput = {
  items: RawItem[];
  purposes: string[];
};

type GroupResult = {
  id: string;
  name: string;
  description?: string;
  purpose?: string;
  itemIds: string[];
};

type CategorizedGroup = {
  id: string;
  name: string;
  purpose: string;
  description?: string;
  items: RawItem[];
};

type GroupingLLMResponse = {
  groups: CategorizedGroup[];
};

// ----------- Core logic (wrapped in CORS) -----------
// inside handler.ts

const groupBookmarksCore = async (
  event: APIGatewayProxyEvent,
  cors: ReturnType<typeof evalCors>
): Promise<APIGatewayProxyResult> => {
  if (!event.body) throw badRequest("Missing body");

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  let parsed: any;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw badRequest("Invalid JSON");
  }

  // Accept the new shape: { items, purposes }
  const rawItems: any[] | null = Array.isArray(parsed.items) ? parsed.items : null;
  const purposes: string[] = Array.isArray(parsed.purposes) ? parsed.purposes : [];

  if (!rawItems) {
    throw badRequest("Missing items[]");
  }
  if (!purposes.length) {
    throw badRequest("Missing purposes[]");
  }

  const defaultPurpose = purposes[0] ?? "personal";

  // Normalize into RawItem[]
  const items: RawItem[] = rawItems
    .map((it) => ({
      id: String(it.id),
      name: it.name ?? it.title ?? "",
      url: it.url,
      source: (it.source ?? "bookmarks") as RawSource,
      lastVisitedAt: it.lastVisitedAt,
    }))
    .filter((it) => it.id && it.url);

  if (!items.length) {
    throw badRequest("No valid items after normalization");
  }

  // --- Cheap local fallback for tiny imports (no OpenAI call) ---
  if (items.length <= 3) {
    const fallbackGroup: CategorizedGroup = {
      id: `grp_${Date.now()}`,
      name: "Imported",
      description: "All imported items",
      purpose: defaultPurpose,
      items,
    };
    return resp(cors, 200, { groups: [fallbackGroup] });
  }

  // --- Cost control for OpenAI ---
  const trimmedItems = items.slice(0, 100);

  const systemPrompt = `
You group browser items into labeled groups.
Return STRICT JSON ONLY using this structure:

{
  "groups": [
    {
      "id": "string",
      "name": "string",
      "description": "string?",
      "purpose": "string?",
      "itemIds": ["item-id-1", "item-id-2"]
    }
  ]
}

Rules:
- 3–8 groups total
- Every item must appear in ≥1 group
- purpose MUST be one of: ${purposes.join(", ")}
- No commentary, just JSON
`.trim();

  const itemLines = trimmedItems
    .map(
      (i, idx) =>
        `${idx + 1}. id=${i.id}, name="${i.name}", url=${i.url}, source=${i.source}`
    )
    .join("\n");

  const userPrompt = `
Items:
${itemLines}

Return JSON as specified above.
`.trim();

  let categorized: CategorizedGroup[];

  try {
    console.info("groupBookmarks: calling OpenAI with", items.length, "items");
    const completion = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_output_tokens: 800,
      temperature: 0.2,
    });
    console.info("groupBookmarks: OpenAI responded");

    const jsonText = completion.output_text;
    if (!jsonText) {
      throw new Error("No output_text from OpenAI");
    }

    // Clean up common markdown wrappers like ```json ... ```
    let cleaned = jsonText.trim();

    // Strip leading ``` or ```json fences
    if (cleaned.startsWith("```")) {
      const firstNewline = cleaned.indexOf("\n");
      if (firstNewline !== -1) {
        cleaned = cleaned.slice(firstNewline + 1);
      }
    }
    // Strip trailing ``` fence
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(0, cleaned.lastIndexOf("```"));
    }
    cleaned = cleaned.trim();

    let groupResults: { groups: GroupResult[] };
    try {
      groupResults = JSON.parse(cleaned);
    } catch (err) {
      console.error("Bad JSON from model:", cleaned);
      throw err;
    }

    categorized = mapToCategorizedGroups(
      groupResults.groups,
      trimmedItems,
      purposes,
      defaultPurpose
    );
  } catch (err) {
    // Log the real cause for you in CloudWatch
    console.error("OpenAI grouping error, falling back to local group:", err);
    console.info("OPENAI_API_KEY: ", process.env.OPENAI_API_KEY);
    console.info("HAS_OPENAI_KEY", !!process.env.OPENAI_API_KEY);
    console.info("OPENAI_KEY_LENGTH", process.env.OPENAI_API_KEY?.length ?? 0);

    // Safe fallback: one group with everything, so no 500
    categorized = [
      {
        id: "imported",
        name: "Imported",
        description: "All imported items",
        purpose: defaultPurpose,
        items,
      },
    ];
  }

  return resp(cors, 200, { groups: categorized });
};


// ------------ Mapping helpers ------------
function mapToCategorizedGroups(
  groups: GroupResult[],
  items: RawItem[],
  purposes: string[],
  defaultPurpose: string
): CategorizedGroup[] {
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const purposeSet = new Set(purposes);

  const categorized: CategorizedGroup[] = groups.map((g) => {
    const groupItems = (g.itemIds ?? [])
      .map((id) => itemsById.get(id))
      .filter(Boolean) as RawItem[];

    const cleanId =
      g.id ||
      g.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    const purpose =
      (g.purpose && purposeSet.has(g.purpose) && g.purpose) || defaultPurpose;

    return {
      id: cleanId,
      name: g.name,
      description: g.description,
      purpose,
      items: groupItems,
    };
  });

  // Add "ungrouped" fallback for any missing items
  const coveredIds = new Set(categorized.flatMap((g) => g.items.map((i) => i.id)));
  const missing = items.filter((i) => !coveredIds.has(i.id));

  if (missing.length) {
    categorized.push({
      id: "ungrouped",
      name: "Ungrouped",
      description: "Items that did not fit other groups",
      purpose: defaultPurpose,
      items: missing,
    });
  }

  return categorized;
}

// ------------ Export: with CORS wrapper ------------
export const handler = withCorsAndErrors(groupBookmarksCore);
