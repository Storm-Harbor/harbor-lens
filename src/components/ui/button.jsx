import { cva } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const variants = cva(
  "button inline-flex items-center justify-center gap-2 rounded-md text-xs font-semibold focus-visible:outline-2 disabled:opacity-50",
  {
    variants: {
      variant: { default: "primary", outline: "", ghost: "text-button" },
    },
    defaultVariants: { variant: "outline" },
  },
);
export function Button({ variant, className, type = "button", ...props }) {
  return (
    <button
      type={type}
      className={twMerge(clsx(variants({ variant }), className))}
      {...props}
    />
  );
}
