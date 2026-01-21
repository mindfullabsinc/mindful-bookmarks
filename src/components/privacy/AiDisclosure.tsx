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
      <button
        type="button"
        className="text-xs text-slate-600 underline hover:text-slate-800"
        onClick={() => setOpen((v) => !v)}
      >
        How automatic organization works
        {open && (
          <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-left text-xs text-slate-700 shadow-sm">
            <AiDisclosureBody serviceName={serviceName} />
          </div>
        )}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">
            How automatic organization works
          </div>
          <div className="mt-1 text-sm text-slate-700">
            Mindful can organize bookmarks using an AI service ({serviceName}).
          </div>
        </div>

        <button
          type="button"
          className="text-sm text-slate-600 underline hover:text-slate-800"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "Learn more"}
        </button>
      </div>

      {open && (
        <div className="mt-3 text-sm text-slate-700">
          <AiDisclosureBody serviceName={serviceName} />
        </div>
      )}
    </div>
  );
}

function AiDisclosureBody({ serviceName }: { serviceName: string }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      <li>
        Mindful sends <span className="font-medium">bookmark titles</span> and{" "}
        <span className="font-medium">sanitized URLs</span> to {serviceName} to
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
