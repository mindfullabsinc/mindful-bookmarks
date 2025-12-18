/* Scripts */
import { remoteGroupingLLM } from "@/scripts/import/groupingLLMRemote"; 

/* Constants */
import { PurposeId } from "@shared/constants/purposeId";
import { ImportSource } from "@/core/constants/import";

/* Types */
import type { GroupingInput, GroupingLLMResponse } from "@shared/types/llmGrouping";

describe("remoteGroupingLLM.group", () => {
  const API_BASE_URL = "https://eidotpc2fc.execute-api.us-west-1.amazonaws.com";

  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const makeItems = (count: number): GroupingInput["items"] =>
    Array.from({ length: count }).map((_, i) => ({
      id: `id-${i}`,
      name: `Item ${i}`,
      url: `https://example.com/${i}`,
      source: ImportSource.Bookmarks,
      lastVisitedAt: 1_700_000_000_000 + i,
    }));

  it("returns empty groups and does not call fetch when there are no items", async () => {
    const input: GroupingInput = {
      items: [],
      purposes: [PurposeId.Personal],
    };

    const result = await remoteGroupingLLM.group(input);

    expect(result).toEqual({ groups: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns local fallback group for tiny imports (< MIN_ITEMS_FOR_LLM) and does not call fetch", async () => {
    const items = makeItems(3); // MIN_ITEMS_FOR_LLM is 6
    const input: GroupingInput = {
      items,
      purposes: [PurposeId.Work, PurposeId.Personal],
    };

    const result = await remoteGroupingLLM.group(input);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.groups).toHaveLength(1);

    const group = result.groups[0];
    expect(group).toEqual({
      id: "imported",
      name: "Imported",
      description: "All imported items",
      purpose: PurposeId.Work, // first purpose
      items,
    });
  });

  it("uses 'personal' as default purpose when purposes array is empty", async () => {
    const items = makeItems(3); // still a tiny import
    const input: GroupingInput = {
      items,
      purposes: [],
    };

    const result = await remoteGroupingLLM.group(input);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.groups).toHaveLength(1);

    const group = result.groups[0];
    expect(group.purpose).toBe(PurposeId.Personal);
    expect(group.items).toBe(items);
  });

  it("calls remote API and returns its response for larger imports (>= MIN_ITEMS_FOR_LLM)", async () => {
    const items = makeItems(6); // equal to MIN_ITEMS_FOR_LLM
    const input: GroupingInput = {
      items,
      purposes: [PurposeId.Work],
    };

    const apiResponse: GroupingLLMResponse = {
      groups: [
        {
          id: "g1",
          name: "From API",
          description: "Remote grouped items",
          purpose: PurposeId.Work,
          items,
        },
      ],
    };

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => apiResponse,
    });

    const result = await remoteGroupingLLM.group(input);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/groupBookmarks`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.any(String),
      })
    );

    // Body should contain the same items when under MAX_ITEMS
    const [, options] = fetchMock.mock.calls[0];
    const parsedBody = JSON.parse((options as any).body);
    expect(parsedBody.items).toHaveLength(6);
    expect(parsedBody.items[0].id).toBe("id-0");

    expect(result).toEqual(apiResponse);
  });

  it("trims items to MAX_ITEMS when calling the API", async () => {
    const items = makeItems(120); // > MAX_ITEMS (100)
    const input: GroupingInput = {
      items,
      purposes: [PurposeId.Work],
    };

    const apiResponse: GroupingLLMResponse = {
      groups: [],
    };

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => apiResponse,
    });

    await remoteGroupingLLM.group(input);

    const [, options] = fetchMock.mock.calls[0];
    const parsedBody = JSON.parse((options as any).body);

    expect(parsedBody.items).toHaveLength(100);
    // Ensure it trims, not picks arbitrary items
    expect(parsedBody.items[0].id).toBe("id-0");
    expect(parsedBody.items[99].id).toBe("id-99");
  });

  it("falls back to local group when the remote API responds with a non-ok status", async () => {
    const items = makeItems(10);
    const input: GroupingInput = {
      items,
      purposes: [PurposeId.Work],
    };

    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const result = await remoteGroupingLLM.group(input);

    // We should have attempted the remote call
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // But fallen back to a local "Imported" group using ALL input items
    expect(result.groups).toHaveLength(1);
    const group = result.groups[0];

    expect(group).toEqual({
      id: "imported",
      name: "Imported",
      description: "All imported items",
      purpose: PurposeId.Work,
      items, // original full list, not trimmed
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
