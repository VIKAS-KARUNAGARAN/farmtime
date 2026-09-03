import { ReactNode } from "react";

type Props = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  onClick?: () => void;
  className?: string;
};

export default function Button({ children, variant = "primary", onClick, className = "" }: Props) {
  const base = "flex items-center gap-2 px-4 py-2.5 rounded-card text-sm font-semibold transition";
  const styles = {
    primary: "bg-primary text-white hover:bg-navy",
    secondary: "bg-white border border-gray-200 text-neutralDark hover:bg-bg",
    ghost: "text-primary hover:underline",
  };
  return (
    <button onClick={onClick} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}
