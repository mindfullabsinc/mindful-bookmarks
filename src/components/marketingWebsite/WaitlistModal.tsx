import * as React from "react";

/* Backend API */
import { WAITLIST_ENDPOINT } from '@/core/constants/constants';

/* Components */
import { Button } from "@/components/primitives/button";
import { Input } from "@/components/primitives/input";

export default function WaitlistModal({
  open,
  onOpenChange,
  tier = "Mindful Pro",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tier?: string;
}) {
  const [email, setEmail] = React.useState("");
  const [status, setStatus] =
    React.useState<"idle" | "loading" | "success" | "error">("idle");

  if (!open) return null; // nothing rendered when closed

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");

    try {
      await fetch(WAITLIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, tier }),
      });

      setStatus("success");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }

  const handleClose = () => {
    setStatus("idle");
    setEmail("");
    onOpenChange(false);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
      aria-modal="true"
      role="dialog"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()} // prevent backdrop click
      >
        {status === "success" ? (
          <div className="text-center py-4">
            <h2 className="text-xl font-semibold">
              You're on the waitlist 🎉
            </h2>
            <p className="mt-2 text-sm text-neutral-600">
              We'll email you when {tier} is ready.
            </p>
            <Button className="cursor-pointer mt-6 w-full" onClick={handleClose}>
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2 className="text-lg font-semibold">Join the waitlist</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Enter your email and we'll notify you when {tier} is available.
            </p>

            <div className="mt-4">
              <Input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                forceLight
              />
            </div>

            {status === "error" && (
              <p className="mt-2 text-sm text-red-600">
                Something went wrong. Please try again.
              </p>
            )}

            <Button
              type="submit"
              className="cursor-pointer mt-6 w-full"
              disabled={status === "loading"}
            >
              {status === "loading" ? "Joining…" : "Join the waitlist"}
            </Button>

            <p className="mt-3 text-xs text-neutral-500">
              We'll only email you when Mindful Pro is ready. No spam.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}