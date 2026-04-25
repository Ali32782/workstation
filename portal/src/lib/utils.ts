import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string, max = 2) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, max)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
