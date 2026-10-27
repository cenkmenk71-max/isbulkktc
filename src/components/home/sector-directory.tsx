"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

type SectorDirectoryProps = {
  children: ReactNode;
  featured: ReactNode;
  itemCount: number;
  openLabel: string;
  closeLabel: string;
};

export function SectorDirectory({
  children,
  featured,
  itemCount,
  openLabel,
  closeLabel,
}: SectorDirectoryProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="sector-directory">
      <button
        className="sector-directory-trigger"
        type="button"
        aria-expanded={isOpen}
        aria-controls="sector-directory-panel"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{isOpen ? closeLabel : openLabel}</span>
        <span className="sector-directory-count">{itemCount}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      <div className="sector-featured-grid" hidden={isOpen}>
        {featured}
      </div>
      <div
        className="sector-directory-panel"
        id="sector-directory-panel"
        hidden={!isOpen}
      >
        {children}
      </div>
    </div>
  );
}
