import { openCopyTo, type CopyPayload } from "@/scripts/events/copyToBridge";
import type { WorkspaceIdType } from "@/core/constants/workspaces";

describe("openCopyTo", () => {
  it("dispatches a CustomEvent with the correct name and payload", () => {
    const payload: CopyPayload = {
      kind: "bookmark",
      fromWorkspaceId: "ws-123" as WorkspaceIdType,
      bookmarkIds: ["b1", "b2"],
    };

    const listener = jest.fn((event: Event) => {
      // no-op; we just want to capture the event
    });

    window.addEventListener("mindful:copyto:open", listener);

    openCopyTo(payload);

    expect(listener).toHaveBeenCalledTimes(1);

    const eventArg = listener.mock.calls[0][0];
    expect(eventArg).toBeInstanceOf(CustomEvent);

    const customEvent = eventArg as CustomEvent<CopyPayload>;
    expect(customEvent.detail).toEqual(payload);

    window.removeEventListener("mindful:copyto:open", listener);
  });

  it("uses the exact event name 'mindful:copyto:open'", () => {
    const spy = jest.spyOn(window, "dispatchEvent");

    const payload: CopyPayload = {
      kind: "workspace",
      fromWorkspaceId: "ws-456" as WorkspaceIdType,
    };

    openCopyTo(payload);

    expect(spy).toHaveBeenCalledTimes(1);
    const dispatchedEvent = spy.mock.calls[0][0];

    expect(dispatchedEvent.type).toBe("mindful:copyto:open");

    spy.mockRestore();
  });
});