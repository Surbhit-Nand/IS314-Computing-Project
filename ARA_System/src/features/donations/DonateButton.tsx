import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { DonateModal } from "./DonateModal";

type DonateButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

// Renders any "Donate" trigger as a button that opens the donation modal.
// The modal's open state lives here so each button is fully self-contained
// and the modal is remounted fresh (blank form) every time it's re-opened.
export function DonateButton({ children, onClick, ...props }: DonateButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        {...props}
        onClick={(event) => {
          onClick?.(event);
          setOpen(true);
        }}
      >
        {children}
      </button>
      <DonateModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}