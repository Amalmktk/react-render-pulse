import { useEffect, useLayoutEffect } from "react";

// useLayoutEffect warns during SSR on React 18; measurements only happen in the browser.
export const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
