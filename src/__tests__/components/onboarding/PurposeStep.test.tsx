import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { PurposeStep } from "@/components/onboarding/PurposeStep";
import { AppContext } from "@/scripts/AppContextProvider";
import type { PurposeId } from "@shared/types/purposeId";

// Optional: keep lucide-react simple in tests
jest.mock("lucide-react", () => ({
  User: (props: any) => <svg data-testid="icon-user" {...props} />,
  Briefcase: (props: any) => <svg data-testid="icon-briefcase" {...props} />,
  GraduationCap: (props: any) => <svg data-testid="icon-graduation" {...props} />,
}));

type AppContextValuePartial = {
  onboardingPurposes: PurposeId[] | null;
  setOnboardingPurposes: jest.Mock;
};

const renderWithContext = (
  {
    onboardingPurposes = [],
    setOnboardingPurposes = jest.fn(),
  }: Partial<AppContextValuePartial> = {},
  props: React.ComponentProps<typeof PurposeStep> = {}
) => {
  const value = {
    onboardingPurposes,
    setOnboardingPurposes,
  } as any; // cast to any so we don't need full AppContext shape

  const utils = render(
    <AppContext.Provider value={value}>
      <PurposeStep {...props} />
    </AppContext.Provider>
  );

  return {
    ...utils,
    setOnboardingPurposes,
  };
};

describe("PurposeStep", () => {
  it("renders three purpose chips and the tip text", () => {
    renderWithContext({ onboardingPurposes: [] });

    expect(
      screen.getByRole("button", { name: /personal/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /work/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /school/i })
    ).toBeInTheDocument();

    expect(
      screen.getByText(/tip: you can select more than one category/i)
    ).toBeInTheDocument();
  });

  it("uses onboardingPurposes from context as the initial selection", () => {
    renderWithContext({ onboardingPurposes: ["work"] });

    const personalButton = screen.getByRole("button", { name: /personal/i });
    const workButton = screen.getByRole("button", { name: /work/i });
    const schoolButton = screen.getByRole("button", { name: /school/i });

    expect(workButton).toHaveClass("chip--active");
    expect(workButton).toHaveAttribute("aria-pressed", "true");

    expect(personalButton).not.toHaveClass("chip--active");
    expect(personalButton).toHaveAttribute("aria-pressed", "false");

    expect(schoolButton).not.toHaveClass("chip--active");
    expect(schoolButton).toHaveAttribute("aria-pressed", "false");
  });

  it("updates selectedIds on click and calls callbacks + context setter", () => {
    const setPrimaryDisabled = jest.fn();
    const onSelectionChange = jest.fn();
    const setOnboardingPurposes = jest.fn();

    renderWithContext(
      {
        onboardingPurposes: [],
        setOnboardingPurposes,
      },
      {
        setPrimaryDisabled,
        onSelectionChange,
      }
    );

    const personalButton = screen.getByRole("button", { name: /personal/i });

    // On initial render (no selection)
    expect(setPrimaryDisabled).toHaveBeenCalledWith(true);
    expect(onSelectionChange).toHaveBeenCalledWith([]);
    expect(setOnboardingPurposes).toHaveBeenCalledWith([]);

    // Click "Personal" to select it
    fireEvent.click(personalButton);

    // Button should now be active
    expect(personalButton).toHaveClass("chip--active");
    expect(personalButton).toHaveAttribute("aria-pressed", "true");

    // Primary should now be enabled (not disabled)
    expect(setPrimaryDisabled).toHaveBeenLastCalledWith(false);

    // onSelectionChange should have been called with ["personal"]
    expect(onSelectionChange).toHaveBeenLastCalledWith(["personal"]);

    // Context setter should have been called with ["personal"] last
    expect(setOnboardingPurposes).toHaveBeenLastCalledWith(["personal"]);
  });

  it("supports selecting multiple purposes", () => {
    const onSelectionChange = jest.fn();
    const setOnboardingPurposes = jest.fn();

    renderWithContext(
      {
        onboardingPurposes: [],
        setOnboardingPurposes,
      },
      { onSelectionChange }
    );

    const personalButton = screen.getByRole("button", { name: /personal/i });
    const workButton = screen.getByRole("button", { name: /work/i });

    fireEvent.click(personalButton);
    fireEvent.click(workButton);

    expect(personalButton).toHaveClass("chip--active");
    expect(workButton).toHaveClass("chip--active");

    // Last selection should be ["personal", "work"] (order matches toggle logic)
    expect(onSelectionChange).toHaveBeenLastCalledWith(["personal", "work"]);
    expect(setOnboardingPurposes).toHaveBeenLastCalledWith([
      "personal",
      "work",
    ]);
  });

  it("toggles a chip off when clicked again and disables primary when no selections remain", () => {
    const setPrimaryDisabled = jest.fn();
    const onSelectionChange = jest.fn();
    const setOnboardingPurposes = jest.fn();

    renderWithContext(
      {
        onboardingPurposes: ["personal"],
        setOnboardingPurposes,
      },
      { setPrimaryDisabled, onSelectionChange }
    );

    const personalButton = screen.getByRole("button", { name: /personal/i });

    // Initially selected
    expect(personalButton).toHaveClass("chip--active");

    // Click again to deselect
    fireEvent.click(personalButton);

    expect(personalButton).not.toHaveClass("chip--active");
    expect(personalButton).toHaveAttribute("aria-pressed", "false");

    // Primary should be disabled again with no selection
    expect(setPrimaryDisabled).toHaveBeenLastCalledWith(true);
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
    expect(setOnboardingPurposes).toHaveBeenLastCalledWith([]);
  });
});