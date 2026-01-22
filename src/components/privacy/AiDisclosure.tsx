import React, { useState } from "react";

type AiDisclosureProps = {
  variant?: "inline" | "compact";
  serviceName?: string; // "OpenAI"
};

export function AiDisclosure({
  variant = "inline",
  serviceName = "OpenAI",
}: AiDisclosureProps) {
  const [open, setOpen] = useState(false);

  if (variant === "compact") {
    return (
      <div className="ai-disclosure-styles">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
        >
          How automatic organization works
          {open && (
            <div className="body-container-compact">
              <AiDisclosureBody serviceName={serviceName} />
            </div>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="ai-disclosure-styles">
      <div className="container-inline">
        <div className="subcontainer-inline">
          <div>
            <div className="inline-title">
              How automatic organization works
            </div>
            <div className="inline-subtitle">
              Mindful can organize bookmarks using an AI service ({serviceName}).
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide" : "Learn more"}
          </button>
        </div>

        {open && (
          <div className="body-container-inline">
            <AiDisclosureBody serviceName={serviceName} />
          </div>
        )}
      </div>
    </div>
  );
}

function AiDisclosureBody({ serviceName }: { serviceName: string }) {
  return (
    <ul>
      <li>
        Mindful sends <span>bookmark titles</span> and{" "}
        <span>sanitized URLs</span> to {serviceName} to
        generate groups.
      </li>
      <li>No page content is sent.</li>
      <li>Processing happens once; results are saved back into Mindful.</li>
      <li>
        You can choose manual import without automatic organization for maximum privacy.
      </li>
    </ul>
  );
}
