import { useRef } from "react";

import styles from "./OtpInput.module.css";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
}

export function OtpInput({ value, onChange, length = 6 }: OtpInputProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  function setDigit(index: number, digit: string) {
    const next = value.padEnd(length, " ").split("");
    next[index] = digit || " ";
    onChange(next.join("").trimEnd());
    if (digit && index < length - 1) inputsRef.current[index + 1]?.focus();
  }

  return (
    <div className={styles.row}>
      {Array.from({ length }, (_, i) => {
        const digit = value[i] ?? "";
        return (
          <input
            key={i}
            ref={(el) => {
              inputsRef.current[i] = el;
            }}
            className={[styles.digit, digit.trim() ? styles.filled : ""].filter(Boolean).join(" ")}
            value={digit.trim()}
            onChange={(e) => setDigit(i, e.target.value.replace(/\D/g, "").slice(-1))}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digit.trim() && i > 0)
                inputsRef.current[i - 1]?.focus();
            }}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            aria-label={`Digit ${i + 1}`}
          />
        );
      })}
    </div>
  );
}
