"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Input for a daily actual (can be negative). Uses a normal text keyboard so
 * the minus sign is available on mobile, and holds intermediate text ("-",
 * "-2", "") while focused so you can type/clear freely. Commits the parsed
 * number, or null when cleared.
 */
export default function ActualInput({
  value,
  onCommit,
  placeholder,
}: {
  value: number | undefined;
  onCommit: (n: number | null) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(() => (value === undefined ? "" : String(value)));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value === undefined ? "" : String(value));
  }, [value]);

  const sanitize = (raw: string) => raw.replace(/[^0-9.\-]/g, "");

  return (
    <input
      type="text"
      inputMode="text"
      placeholder={placeholder}
      value={text}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => {
        const t = sanitize(e.target.value);
        setText(t);
        const s = t.trim();
        if (s === "") {
          onCommit(null);
        } else {
          const n = Number(s);
          if (Number.isFinite(n)) onCommit(n); // "-", "." etc. are held, not committed
        }
      }}
      onBlur={(e) => {
        focused.current = false;
        const s = sanitize(e.target.value).trim();
        const n = Number(s);
        setText(s !== "" && Number.isFinite(n) ? String(n) : "");
      }}
    />
  );
}
