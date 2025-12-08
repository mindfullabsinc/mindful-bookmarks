import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

import { ThemeSelectorStep } from "@/components/onboarding/ThemeSelectorStep";
import { AppContext } from "@/scripts/AppContextProvider";
import { ThemeChoice } from "@/core/constants/theme";

describe("ThemeSelectorStep", () => {
  const renderWithContext = (theme: ThemeChoice | null, setThemePreference = jest.fn()) => {
    return render(
      <AppContext.Provider
        value={
          {
            theme,
            setThemePreference,
          } as any // cast to avoid needing the full AppContext shape
        }
      >
        <ThemeSelectorStep />
      </AppContext.Provider>
    );
  };

  it("renders headings and all three theme options with previews", () => {
    renderWithContext(ThemeChoice.SYSTEM);

    // Text content
    expect(screen.getByText("Choose your look")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Pick the theme that feels most natural to you\. You can change this anytime in Settings\./
      )
    ).toBeInTheDocument();

    // Theme option buttons
    const lightButton = screen.getByRole("button", { name: /light/i });
    const darkButton = screen.getByRole("button", { name: /dark/i });
    const systemButton = screen.getByRole("button", { name: /match system/i });

    expect(lightButton).toBeInTheDocument();
    expect(darkButton).toBeInTheDocument();
    expect(systemButton).toBeInTheDocument();

    // Preview images
    expect(screen.getByAltText("Light preview")).toBeInTheDocument();
    expect(screen.getByAltText("Dark preview")).toBeInTheDocument();
    expect(screen.getByAltText("Match System preview")).toBeInTheDocument();
  });

  it("uses the context theme as the initially selected option", () => {
    renderWithContext(ThemeChoice.SYSTEM);

    const systemButton = screen.getByRole("button", { name: /match system/i });
    const lightButton = screen.getByRole("button", { name: /light/i });
    const darkButton = screen.getByRole("button", { name: /dark/i });

    expect(systemButton).toHaveClass("chip--active");
    expect(lightButton).not.toHaveClass("chip--active");
    expect(darkButton).not.toHaveClass("chip--active");
  });

   it("updates selected option and calls setThemePreference when a chip is clicked", () => {
    const setThemePreference = jest.fn().mockResolvedValue(undefined);
    renderWithContext(ThemeChoice.SYSTEM, setThemePreference);

    const darkButton = screen.getByRole("button", { name: /dark/i });

    fireEvent.click(darkButton);

    // Context updater is called with the correct ThemeChoice
    expect(setThemePreference).toHaveBeenCalledTimes(1);
    expect(setThemePreference).toHaveBeenCalledWith(ThemeChoice.DARK);
  }); 

  it("syncs local selection when the context theme changes", () => {
    const setThemePreference = jest.fn().mockResolvedValue(undefined);

    const { rerender } = render(
      <AppContext.Provider
        value={
          {
            theme: ThemeChoice.LIGHT,
            setThemePreference,
          } as any
        }
      >
        <ThemeSelectorStep />
      </AppContext.Provider>
    );

    const lightButton = screen.getByRole("button", { name: /light/i });
    const darkButton = screen.getByRole("button", { name: /dark/i });

    // Initially, LIGHT is active
    expect(lightButton).toHaveClass("chip--active");
    expect(darkButton).not.toHaveClass("chip--active");

    // Rerender with theme = DARK to trigger the effect
    rerender(
      <AppContext.Provider
        value={
          {
            theme: ThemeChoice.DARK,
            setThemePreference,
          } as any
        }
      >
        <ThemeSelectorStep />
      </AppContext.Provider>
    );

    // After context change, DARK should be active
    expect(darkButton).toHaveClass("chip--active");
    expect(lightButton).not.toHaveClass("chip--active");
  });
});