import { For, onMount } from "solid-js";

interface OTPInputProps {
  disabled?: boolean;
  length?: number;
  onChange: (value: string) => void;
  value: string;
}

export default function OTPInput(props: OTPInputProps) {
  const length = () => props.length ?? 6;
  const inputRefs: HTMLInputElement[] = [];
  const digits = () => Array.from({ length: length() }, (_, index) => props.value[index] ?? "");

  onMount(() => {
    inputRefs[0]?.focus();
  });

  function updateDigit(index: number, value: string) {
    if (!/^\d?$/.test(value)) {
      return;
    }

    const nextValue = [...props.value.padEnd(length())];
    nextValue[index] = value;
    props.onChange(nextValue.join("").trimEnd().slice(0, length()));

    if (value && index < length() - 1) {
      inputRefs[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, event: KeyboardEvent) {
    if (event.key === "Backspace" && !props.value[index] && index > 0) {
      inputRefs[index - 1]?.focus();
    }
  }

  function handlePaste(event: ClipboardEvent) {
    event.preventDefault();
    const pasted = event.clipboardData?.getData("text").replace(/\D/g, "").slice(0, length()) ?? "";
    props.onChange(pasted);
    inputRefs[Math.min(pasted.length, length() - 1)]?.focus();
  }

  return (
    <div class="otp-input-group">
      <For each={digits()}>
        {(digit, index) => (
          <input
            ref={(element) => {
              inputRefs[index()] = element;
            }}
            aria-label={`Verification code digit ${index() + 1}`}
            disabled={props.disabled}
            inputMode="numeric"
            maxLength={1}
            onInput={(event) => updateDigit(index(), event.currentTarget.value)}
            onKeyDown={(event) => handleKeyDown(index(), event)}
            onPaste={handlePaste}
            type="text"
            value={digit}
          />
        )}
      </For>
    </div>
  );
}
