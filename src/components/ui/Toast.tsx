import React, { useEffect, useState } from "react";

type ToastProps = { message: string | null };

/**
 * Display a temporary toast notification whenever the `message` prop changes.
 *
 * @param message Latest toast message to show (null hides the toast).
 */
export function Toast({ message }: ToastProps) {
  const [visible, setVisible] = useState(false);

  /**
   * Reveal the toast when a message arrives and auto-hide after 3 seconds.
   */
  useEffect(() => {
    if (message) {
      setVisible(true);
      const t = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(t);
    }
  }, [message]);

  if (!message || !visible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-60 bg-black/80 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
      {message}
    </div>
  );
}
