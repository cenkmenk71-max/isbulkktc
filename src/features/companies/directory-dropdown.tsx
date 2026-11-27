"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import type { DirectoryTargetOption } from "./company-profile-form";

export function DirectoryDropdown({
  targets,
  value,
  onSelect,
}: {
  targets: DirectoryTargetOption[];
  value: string;
  onSelect: (target: DirectoryTargetOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = targets.filter((target) =>
    target.label.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node) &&
        listRef.current &&
        !listRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="directory-dropdown" style={{ position: "relative", display: "inline-block", width: "100%" }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="directory-dropdown-button"
      >
        <span className="directory-dropdown-value">{value || "Şirket rehberi seçin"}</span>
        <ChevronDown size={16} className="directory-dropdown-chevron" />
      </button>

      {open && (
        <ul ref={listRef} className="directory-dropdown-list" role="listbox">
          <div className="directory-dropdown-search">
            <input
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Şirket ara…"
              className="directory-dropdown-search-input"
            />
          </div>
          {filtered.length === 0 ? (
            <li className="directory-dropdown-empty" role="none">
              {query ? "Eşleşen şirket bulunamadı" : "Rehberde kayıtlı şirket yok"}
            </li>
          ) : (
            filtered.map((target) => (
              <li
                key={target.value}
                role="option"
                aria-selected={target.value === value}
                className="directory-dropdown-item"
                onClick={() => {
                  onSelect(target);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <div className="directory-dropdown-item-main">
                  {target.label}
                </div>
                <div className="directory-dropdown-item-meta">
                  <MapPin size={12} aria-hidden="true" />
                  <span className="directory-dropdown-district">{target.label}</span>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}