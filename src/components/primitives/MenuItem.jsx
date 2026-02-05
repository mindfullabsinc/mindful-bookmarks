import React from "react";

export function MenuItem({ icon, label, trailing, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between rounded-xl px-4 py-3 hover:bg-gray-100 transition"
    >
      <div className="flex items-center gap-3">
        <i className={`fas fa-${icon} text-gray-700`}></i>
        <span className="text-gray-800 font-medium">{label}</span>
      </div>
      <span className="text-gray-500">{trailing ?? ""}</span>
    </button>
  );
}