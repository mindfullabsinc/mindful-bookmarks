/* -------------------- Imports -------------------- */
import React, { useState, useEffect, useContext } from "react";
import type { ComponentType, SVGProps } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

/* Constants */
import { ThemeChoice } from "@/core/constants/theme";

/* Context */
import { AppContext } from "@/scripts/AppContextProvider";
/* ---------------------------------------------------------- */

/* -------------------- Local types -------------------- */
type ThemeOption = {
  id: ThemeChoice;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  preview: string;
};
/* ---------------------------------------------------------- */

export const ThemeSelectorStep: React.FC = () => {
  /* -------------------- Context / state -------------------- */
  const { theme, setThemePreference } = useContext(AppContext);
  const [selected, setSelected] = useState<ThemeChoice>(
    theme ?? ThemeChoice.SYSTEM
  );
  /* ---------------------------------------------------------- */

  /* -------------------- Effects -------------------- */
  /* Keep local selection in sync if theme changes elsewhere */
  useEffect(() => {
    if (theme && theme !== selected) {
      setSelected(theme);
    }
  }, [theme, selected]);
  /* ---------------------------------------------------------- */

  const options: ThemeOption[] = [
    {
      id: ThemeChoice.LIGHT,
      label: "Light",
      icon: Sun, 
      preview: "/assets/ui-screenshots/light-mode.png",
    },
    {
      id: ThemeChoice.DARK,
      label: "Dark",
      icon: Moon,
      preview: "/assets/ui-screenshots/dark-mode.png",
    },
    {
      id: ThemeChoice.SYSTEM,
      label: "Match System",
      icon: Monitor,
      preview: "/assets/ui-screenshots/light-dark-mode.png",
    },
  ] as const;

  return (
    <>
      <div className="mb-4">
        {/* Divider */}
        <div className="divider"></div>

        <p className="prompt-title">
          Choose your look
        </p>
        <p className="prompt-subtitle">
          Pick the theme that feels most natural to you. You can change this
          anytime in Settings.
        </p>
      </div>

      <div className="theme-chip-grid">
        {options.map((opt) => {
          const active = selected === opt.id;
          const Icon = opt.icon;

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setSelected(opt.id);
                void setThemePreference(opt.id);
              }}
              className={`chip theme-chip ${active ? "theme-chip--active" : ""}`}
            >
              <div className="theme-chip-header">
                <Icon className="chip-icon" />
                <span className="chip-label">{opt.label}</span>
              </div>

              {opt.preview && (
                <img
                  src={opt.preview}
                  alt={`${opt.label} preview`}
                  className="theme-chip-preview"
                />
              )}
            </button>
          );
        })}
      </div>
    </>
  );
};
