import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMobilePerformanceMode } from "../../hooks/useMobilePerformanceMode";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import "./ScrollTypewriterText.css";

function arraysMatch(first, second) {
  return first.length === second.length && first.every((item, index) => item === second[index]);
}

export function ScrollTypewriterText({
  text,
  speed = 24,
  delay = 120,
  className = "",
  once = true,
}) {
  const rootRef = useRef(null);
  const hasPlayedRef = useRef(false);
  const reducedMotion = usePrefersReducedMotion();
  const mobilePerformanceMode = useMobilePerformanceMode();
  const motionDisabled = reducedMotion || mobilePerformanceMode;
  const [isVisible, setIsVisible] = useState(motionDisabled);
  const words = useMemo(() => text.trim().split(/\s+/), [text]);
  const [lines, setLines] = useState([text]);
  const [visibleCharacters, setVisibleCharacters] = useState(motionDisabled ? [text.length] : [0]);

  useLayoutEffect(() => {
    if (motionDisabled) {
      setLines([text]);
      return undefined;
    }

    const node = rootRef.current;
    if (!node) return undefined;

    let frameId;
    let isActive = true;

    const measureLines = () => {
      const wordNodes = Array.from(node.querySelectorAll("[data-scroll-typewriter-word]"));
      const measuredLines = [];
      let currentLine = [];
      let currentTop;

      wordNodes.forEach((wordNode) => {
        const wordTop = Math.round(wordNode.offsetTop);

        if (currentTop === undefined || Math.abs(wordTop - currentTop) <= 2) {
          currentLine.push(wordNode.textContent);
          currentTop ??= wordTop;
          return;
        }

        measuredLines.push(currentLine.join(" "));
        currentLine = [wordNode.textContent];
        currentTop = wordTop;
      });

      if (currentLine.length) {
        measuredLines.push(currentLine.join(" "));
      }

      if (measuredLines.length) {
        setLines((currentLines) => (arraysMatch(currentLines, measuredLines) ? currentLines : measuredLines));
      }
    };

    const scheduleMeasurement = () => {
      if (!isActive) return;

      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measureLines);
    };

    scheduleMeasurement();

    const resizeObserver = new ResizeObserver(scheduleMeasurement);
    resizeObserver.observe(node);
    document.fonts?.ready.then(scheduleMeasurement);

    return () => {
      isActive = false;
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, [motionDisabled, text]);

  useEffect(() => {
    if (motionDisabled) {
      hasPlayedRef.current = true;
      setIsVisible(true);
      return undefined;
    }

    const node = rootRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && (!once || !hasPlayedRef.current)) {
          hasPlayedRef.current = true;
          setIsVisible(true);

          if (once) {
            observer.unobserve(node);
          }
        } else if (!entry.isIntersecting && !once) {
          setIsVisible(false);
          setVisibleCharacters([]);
        }
      },
      { threshold: 0.35, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [motionDisabled, once]);

  useEffect(() => {
    if (motionDisabled) {
      setVisibleCharacters(lines.map((line) => line.length));
      return undefined;
    }

    if (!isVisible) {
      setVisibleCharacters(lines.map(() => 0));
      return undefined;
    }

    // The typewriter updates text progressively with rAF on desktop. On mobile
    // performance mode this branch is skipped so scroll does not compete with
    // repeated React renders while the user is moving through the landing page.
    let frameId;
    const startedAt = window.performance.now();
    const lineStagger = Math.max(160, Math.min(260, speed * 8));

    const typeLines = (now) => {
      const elapsed = now - startedAt;
      const nextVisibleCharacters = lines.map((line, index) => {
        const lineElapsed = elapsed - delay - index * lineStagger;
        return lineElapsed < 0 ? 0 : Math.min(line.length, Math.floor(lineElapsed / speed) + 1);
      });

      setVisibleCharacters((current) =>
        arraysMatch(current, nextVisibleCharacters) ? current : nextVisibleCharacters,
      );

      const isComplete = nextVisibleCharacters.every((count, index) => count >= lines[index].length);
      if (!isComplete) {
        frameId = window.requestAnimationFrame(typeLines);
      }
    };

    frameId = window.requestAnimationFrame(typeLines);
    return () => window.cancelAnimationFrame(frameId);
  }, [delay, isVisible, lines, motionDisabled, speed]);

  const activeLineIndex = visibleCharacters.reduce(
    (activeIndex, count, index) =>
      lines[index] && count > 0 && count < lines[index].length ? index : activeIndex,
    -1,
  );

  return (
    <span ref={rootRef} className={`scroll-typewriter ${className}`} aria-label={text}>
      <span className="scroll-typewriter-reserve" aria-hidden="true">
        {words.map((word, index) => (
          <React.Fragment key={`${word}-${index}`}>
            <span data-scroll-typewriter-word>{word}</span>
            {index < words.length - 1 ? " " : null}
          </React.Fragment>
        ))}
      </span>
      <span className="scroll-typewriter-output" aria-hidden="true">
        {lines.map((line, index) => {
          const visibleCount = motionDisabled ? line.length : (visibleCharacters[index] ?? 0);
          const hasStarted = motionDisabled || visibleCount > 0;

          return (
            <span
              key={`${line}-${index}`}
              className={`scroll-typewriter-line ${hasStarted ? "is-started" : ""}`}
            >
              {line.slice(0, visibleCount)}
              {activeLineIndex === index && <span className="scroll-typewriter-cursor" />}
            </span>
          );
        })}
      </span>
    </span>
  );
}

export default ScrollTypewriterText;
