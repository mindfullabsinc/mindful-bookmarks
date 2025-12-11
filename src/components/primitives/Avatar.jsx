import React from "react";

export function Avatar({ initials }) {
  return (
    <div className="relative">
      <div className="h-16 w-16 rounded-full bg-gray-200 grid place-items-center text-gray-700 font-bold text-xl">
        {initials}
      </div>
    </div>
  );
}