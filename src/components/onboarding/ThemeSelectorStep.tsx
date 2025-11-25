import React, { useState, useEffect, useContext } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

/* Constants */
import { ThemeChoice } from "@/core/constants/theme";
/* Context */
import { AppContext } from "@/scripts/AppContextProvider";

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

  const options = [
    {
      id: ThemeChoice.LIGHT,
      label: "Light",
      icon: <Sun className="h-6 w-6 text-neutral-900 dark:text-neutral-100" />,
      preview: "/assets/ui-screenshots/light-mode.png",
    },
    {
      id: ThemeChoice.DARK,
      label: "Dark",
      icon: <Moon className="h-6 w-6 text-neutral-900 dark:text-neutral-100" />,
      preview: "/assets/ui-screenshots/dark-mode.png",
    },
    {
      id: ThemeChoice.SYSTEM,
      label: "Match System",
      icon: <Monitor className="h-6 w-6 text-neutral-900 dark:text-neutral-100" />,
      preview: "/assets/ui-screenshots/light-dark-mode.png",
    },
  ] as const;

  return (
    <>
      <div className="mb-4">
        <div className="h-px w-full bg-neutral-200 dark:bg-neutral-800 mb-4"></div>

        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Choose your look
        </p>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Pick the theme that feels most natural to you. You can change this
          anytime in Settings.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {options.map((opt) => {
          const active = selected === opt.id;

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setSelected(opt.id);
                void setThemePreference(opt.id);
                console.log(`Called setThemePreference with ${opt.id}`);
              }}
              className={`
                flex flex-col items-center rounded-xl border p-4 transition
                shadow-sm bg-white dark:bg-black hover:bg-neutral-50 dark:hover:bg-neutral-950 cursor-pointer
                ${
                  active
                    ? "border-blue-500 ring-2 ring-blue-300"
                    : "border-neutral-300 dark:border-neutral-700"
                }
              `}
            >
              <div className="mb-3">{opt.icon}</div>

              {opt.preview && (
                <img
                  src={opt.preview}
                  alt={`${opt.label} preview`}
                  className="mb-3 h-24 w-full rounded-md object-cover border border-neutral-300/60 dark:border-neutral-700/60"
                />
              )}

              <span
                className={`text-sm font-medium ${
                  active ? "text-blue-600 dark:text-blue-400" : "text-neutral-700 dark:text-neutral-300"
                }`}
              >
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
};
