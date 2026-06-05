import { useEffect, useState } from "react";

const MOBILE_QUERY = "(max-width: 767px)";

export function useMobilePerformanceMode() {
  const [isMobilePerformanceMode, setIsMobilePerformanceMode] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(MOBILE_QUERY).matches : false,
  );

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const updateMode = () => setIsMobilePerformanceMode(media.matches);

    updateMode();
    media.addEventListener("change", updateMode);
    return () => media.removeEventListener("change", updateMode);
  }, []);

  return isMobilePerformanceMode;
}
