import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "wouter";
import styles from "./ui.module.css";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const cls = (variant: Variant, block: boolean): string => [styles.button, variant === "primary" ? styles.primary : variant === "ghost" ? styles.ghost : variant === "danger" ? styles.danger : "", block ? styles.block : ""].filter(Boolean).join(" ");

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { readonly variant?: Variant; readonly block?: boolean }

/** A real <button>; ≥ 44 px target; a disabled primary action should say why in nearby text (UX spec §4.2). */
export function Button({ variant = "secondary", block = false, type = "button", className, ...rest }: ButtonProps): ReactNode {
  return <button type={type} className={[cls(variant, block), className].filter(Boolean).join(" ")} {...rest} />;
}

export function LinkButton({ href, variant = "secondary", block = false, children }: { href: string; variant?: Variant; block?: boolean; children: ReactNode }): ReactNode {
  return <Link href={href} className={cls(variant, block)}>{children}</Link>;
}
