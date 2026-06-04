import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import "./RotatingText.css";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

const RotatingText = forwardRef((props, ref) => {
  const {
    texts = [],
    transition = { type: "spring", damping: 25, stiffness: 300 },
    initial = { y: "100%", opacity: 0 },
    animate = { y: 0, opacity: 1 },
    exit = { y: "-120%", opacity: 0 },
    animatePresenceMode = "wait",
    animatePresenceInitial = false,
    rotationInterval = 2200,
    staggerDuration = 0,
    staggerFrom = "first",
    loop = true,
    auto = true,
    splitBy = "characters",
    onNext,
    mainClassName,
    splitLevelClassName,
    elementLevelClassName,
    ...rest
  } = props;

  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const shouldReduceMotion = useReducedMotion();

  const splitIntoCharacters = useCallback((text) => {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
      return Array.from(segmenter.segment(text), (segment) => segment.segment);
    }

    return Array.from(text);
  }, []);

  const elements = useMemo(() => {
    const currentText = texts[currentTextIndex] || "";

    if (splitBy === "characters") {
      const words = currentText.split(" ");
      return words.map((word, index) => ({
        characters: splitIntoCharacters(word),
        needsSpace: index !== words.length - 1,
      }));
    }

    if (splitBy === "words") {
      return currentText.split(" ").map((word, index, array) => ({
        characters: [word],
        needsSpace: index !== array.length - 1,
      }));
    }

    if (splitBy === "lines") {
      return currentText.split("\n").map((line, index, array) => ({
        characters: [line],
        needsSpace: index !== array.length - 1,
      }));
    }

    return currentText.split(splitBy).map((part, index, array) => ({
      characters: [part],
      needsSpace: index !== array.length - 1,
    }));
  }, [currentTextIndex, splitBy, splitIntoCharacters, texts]);

  const getStaggerDelay = useCallback(
    (index, totalChars) => {
      if (shouldReduceMotion) return 0;
      if (staggerFrom === "first") return index * staggerDuration;
      if (staggerFrom === "last") return (totalChars - 1 - index) * staggerDuration;

      if (staggerFrom === "center") {
        const center = Math.floor(totalChars / 2);
        return Math.abs(center - index) * staggerDuration;
      }

      if (staggerFrom === "random") {
        const randomIndex = Math.floor(Math.random() * totalChars);
        return Math.abs(randomIndex - index) * staggerDuration;
      }

      return Math.abs(staggerFrom - index) * staggerDuration;
    },
    [shouldReduceMotion, staggerDuration, staggerFrom],
  );

  const handleIndexChange = useCallback(
    (newIndex) => {
      setCurrentTextIndex(newIndex);
      onNext?.(newIndex);
    },
    [onNext],
  );

  const next = useCallback(() => {
    const nextIndex = currentTextIndex === texts.length - 1 ? (loop ? 0 : currentTextIndex) : currentTextIndex + 1;

    if (nextIndex !== currentTextIndex) {
      handleIndexChange(nextIndex);
    }
  }, [currentTextIndex, handleIndexChange, loop, texts.length]);

  const previous = useCallback(() => {
    const previousIndex = currentTextIndex === 0 ? (loop ? texts.length - 1 : currentTextIndex) : currentTextIndex - 1;

    if (previousIndex !== currentTextIndex) {
      handleIndexChange(previousIndex);
    }
  }, [currentTextIndex, handleIndexChange, loop, texts.length]);

  const jumpTo = useCallback(
    (index) => {
      const validIndex = Math.max(0, Math.min(index, texts.length - 1));

      if (validIndex !== currentTextIndex) {
        handleIndexChange(validIndex);
      }
    },
    [currentTextIndex, handleIndexChange, texts.length],
  );

  const reset = useCallback(() => {
    if (currentTextIndex !== 0) {
      handleIndexChange(0);
    }
  }, [currentTextIndex, handleIndexChange]);

  useImperativeHandle(ref, () => ({ next, previous, jumpTo, reset }), [jumpTo, next, previous, reset]);

  useEffect(() => {
    if (!auto || texts.length <= 1) return undefined;

    const intervalId = window.setInterval(next, rotationInterval);
    return () => window.clearInterval(intervalId);
  }, [auto, next, rotationInterval, texts.length]);

  if (texts.length === 0) return null;

  const resolvedInitial = shouldReduceMotion ? { opacity: 0 } : initial;
  const resolvedAnimate = shouldReduceMotion ? { opacity: 1 } : animate;
  const resolvedExit = shouldReduceMotion ? { opacity: 0 } : exit;
  const resolvedTransition = shouldReduceMotion ? { duration: 0.12 } : transition;

  return (
    <motion.span className={cn("text-rotate", mainClassName)} {...rest} layout transition={resolvedTransition}>
      <span className="text-rotate-sr-only">{texts[currentTextIndex]}</span>
      <span className="text-rotate-measure" aria-hidden="true">{texts[currentTextIndex]}</span>

      <AnimatePresence mode={animatePresenceMode} initial={animatePresenceInitial}>
        <motion.span
          key={currentTextIndex}
          className={cn(splitBy === "lines" ? "text-rotate-lines" : "text-rotate")}
          layout
          aria-hidden="true"
        >
          {elements.map((wordObject, wordIndex, array) => {
            const previousCharactersCount = array
              .slice(0, wordIndex)
              .reduce((sum, word) => sum + word.characters.length, 0);
            const totalCharacters = array.reduce((sum, word) => sum + word.characters.length, 0);

            return (
              <span key={`${wordIndex}-${wordObject.characters.join("")}`} className={cn("text-rotate-word", splitLevelClassName)}>
                {wordObject.characters.map((character, characterIndex) => (
                  <motion.span
                    key={`${character}-${characterIndex}`}
                    initial={resolvedInitial}
                    animate={resolvedAnimate}
                    exit={resolvedExit}
                    transition={{
                      ...resolvedTransition,
                      delay: getStaggerDelay(previousCharactersCount + characterIndex, totalCharacters),
                    }}
                    className={cn("text-rotate-element", elementLevelClassName)}
                  >
                    {character}
                  </motion.span>
                ))}

                {wordObject.needsSpace && <span className="text-rotate-space"> </span>}
              </span>
            );
          })}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
});

RotatingText.displayName = "RotatingText";

export default RotatingText;
