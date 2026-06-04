import { useReducedMotion } from "framer-motion";

export function usePrefersReducedMotion() {
  return Boolean(useReducedMotion());
}

