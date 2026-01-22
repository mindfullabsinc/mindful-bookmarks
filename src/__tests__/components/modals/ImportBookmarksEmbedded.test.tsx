import { render } from "@testing-library/react";
import { ImportBookmarksEmbedded } from "@/components/modals/ImportBookmarksEmbedded";
import { ImportBookmarksContent } from "@/components/shared/ImportBookmarksContent";

jest.mock("@/components/shared/ImportBookmarksContent", () => ({
  ImportBookmarksContent: jest.fn(() => null),
}));

describe("ImportBookmarksEmbedded", () => {
  it("forces variant=embedded", () => {
    render(
      <ImportBookmarksEmbedded
        onComplete={jest.fn()}
      />
    );

    expect(ImportBookmarksContent).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "embedded" }),
      expect.anything()
    );
  });
});