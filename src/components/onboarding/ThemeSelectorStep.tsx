import React, { useState, useEffect } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

/* Constants */
import { ThemeChoice} from "@/core/constants/onboarding";


export const ThemeSelectorStep: React.FC = () => {
  const [selected, setSelected] = useState<ThemeChoice>(ThemeChoice.SYSTEM);

  // Persist choice (local-only for now)
  useEffect(() => {
    chrome?.storage?.local?.set?.({
      "mindful:themePreference": selected,
    });
  }, [selected]);

  const options = [
    {
      id: ThemeChoice.LIGHT,
      label: "Light",
      icon: <Sun className="h-6 w-6 text-neutral-900" />,
      preview: "/assets/ui-screenshots/light-mode.png", 
    },
    {
      id: ThemeChoice.DARK,
      label: "Dark",
      icon: <Moon className="h-6 w-6 text-neutral-900" />,
      preview: "/assets/ui-screenshots/dark-mode.png",
    },
    {
      id: ThemeChoice.SYSTEM,
      label: "Match System",
      icon: <Monitor className="h-6 w-6 text-neutral-900" />,
      preview: "/assets/onboarding/system-preview.png",
    },
  ] as const;

  return (
    <>
      <div className="mb-4">
        <div className="h-px w-full bg-neutral-200 mb-4"></div>

        <p className="text-sm font-medium text-neutral-900">
          Choose your look
        </p>
        <p className="mt-1 text-sm text-neutral-600">
          Pick the theme that feels most natural to you. You can change this anytime in Settings.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {options.map((opt) => {
          const active = selected === opt.id;

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSelected(opt.id)}
              className={`
                flex flex-col items-center rounded-xl border p-4 transition
                shadow-sm bg-white hover:bg-neutral-50 cursor-pointer
                ${
                  active
                    ? "border-blue-500 ring-2 ring-blue-300"
                    : "border-neutral-300"
                }
              `}
            >
              <div className="mb-3">{opt.icon}</div>

              {opt.preview && (
                <img
                  src={opt.preview}
                  alt={`${opt.label} preview`}
                  className="mb-3 h-24 w-full rounded-md object-cover border border-neutral-300/60"
                />
              )}

              <span
                className={`text-sm font-medium ${
                  active ? "text-blue-600" : "text-neutral-700"
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
