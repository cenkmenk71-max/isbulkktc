"use client";

import { useEffect } from "react";

/**
 * Progressive-enhancement motion layer.
 *
 * Everything here is additive: the markup ships fully visible and readable, and
 * this component only *adds* movement once it has hydrated. If it throws, the
 * catch below removes the `motion-ready` class and the page stays as a plain
 * static document, so motion can never make content unreachable.
 *
 * The whole layer is skipped under `prefers-reduced-motion: reduce`, which the
 * accessibility suite asserts on every route and locale.
 */

const REVEAL_SELECTOR = "[data-reveal]";

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * True when an ancestor of `node` is an element that scrolls its own overflow,
 * i.e. a modal panel or dropdown rather than the document. Lenis walks the
 * event path, so returning true for any such ancestor keeps the page from
 * hijacking a gesture meant for that panel.
 */
function isNestedScrollContainer(node: HTMLElement): boolean {
  for (let el: HTMLElement | null = node; el; el = el.parentElement) {
    if (el === document.body || el === document.documentElement) return false;
    const { overflowY, overflowX } = getComputedStyle(el);
    const scrollable =
      /(auto|scroll|overlay)/.test(overflowY) ||
      /(auto|scroll|overlay)/.test(overflowX);
    if (scrollable && el.scrollHeight > el.clientHeight + 1) return true;
  }
  return false;
}

export function MotionController() {
  useEffect(() => {
    if (prefersReducedMotion()) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    // The OS setting can change while the page is open (and the accessibility
    // suite toggles it mid-test). Watch the query so the layer tears itself down
    // the moment motion is disallowed, instead of leaving the tilt's inline
    // transform on the cards.
    const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    // Loaded lazily so GSAP/Lenis never enter the initial JS graph and cannot
    // delay first paint on a route that only needs a static document.
    (async () => {
      try {
        const [{ default: gsap }, { ScrollTrigger }, { default: Lenis }] =
          await Promise.all([
            import("gsap"),
            import("gsap/ScrollTrigger"),
            import("lenis"),
          ]);
        if (cancelled) return;

        gsap.registerPlugin(ScrollTrigger);
        document.documentElement.classList.add("motion-ready");

        // Smooth scroll, driven by GSAP's ticker so reveals stay in step with
        // the scroll position instead of racing it on their own frame loop.
        const lenis = new Lenis({
          autoRaf: false,
          duration: 1.05,
          easing: (t: number) => 1 - Math.pow(1 - t, 3),
          smoothWheel: true,
          // Nested scroll areas (modal forms, the language menu, the consent
          // card) must keep their native scrolling; only the page itself is
          // smoothed, otherwise a wheel gesture inside one of them would move
          // the document instead. Detect them structurally rather than by an
          // attribute list, so a new modal cannot silently regress this.
          prevent: (node) =>
            node.closest("[data-lenis-prevent]") !== null ||
            isNestedScrollContainer(node),
        });
        lenis.on("scroll", ScrollTrigger.update);
        const raf = (time: number) => lenis.raf(time * 1000);
        gsap.ticker.add(raf);
        gsap.ticker.lagSmoothing(0);

        const context = gsap.context(() => {
          revealOnScroll(gsap, ScrollTrigger);
          animateHero(gsap);
        });
        const removeTilt = addCardTilt(gsap);

        // A disclosure that mounts new `[data-reveal]` elements after load (the
        // sector explorer panel) announces itself; re-scan and animate whatever
        // became visible since the first pass.
        const onRefresh = () => {
          revealOnScroll(gsap, ScrollTrigger, true);
        };
        window.addEventListener("isbulkktc:motion-refresh", onRefresh);

        cleanup = () => {
          window.removeEventListener("isbulkktc:motion-refresh", onRefresh);
          removeTilt();
          context.revert();
          gsap.ticker.remove(raf);
          lenis.destroy();
          ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
          document.documentElement.classList.remove("motion-ready");
        };

        const onReduceChange = () => {
          if (!reduceQuery.matches) return;
          cleanup?.();
          cleanup = undefined;
        };
        reduceQuery.addEventListener("change", onReduceChange);
        const removeReduceListener = () =>
          reduceQuery.removeEventListener("change", onReduceChange);

        const teardown = cleanup;
        cleanup = () => {
          removeReduceListener();
          teardown?.();
        };

        // The query may have flipped to `reduce` while the modules were loading.
        onReduceChange();
      } catch {
        document.documentElement.classList.remove("motion-ready");
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}

type Gsap = typeof import("gsap").default;
type St = typeof import("gsap/ScrollTrigger").ScrollTrigger;

/**
 * Elements opt in with `data-reveal`. Anything already on screen animates on
 * load; anything below the fold waits for its trigger. Because the animation is
 * created from the element's *current* state, a failure leaves it visible.
 *
 * `refresh` is set when a disclosure has just revealed more of the document;
 * already-processed elements are skipped so they are not re-animated.
 */
function revealOnScroll(gsap: Gsap, ScrollTrigger: St, refresh = false) {
  const targets = gsap.utils
    .toArray<HTMLElement>(REVEAL_SELECTOR)
    .filter((target) => !(refresh && target.dataset.revealReady === "true"));
  if (targets.length === 0) return;

  const viewportBottom = window.innerHeight;
  const onScreen: HTMLElement[] = [];
  const belowFold: HTMLElement[] = [];

  for (const target of targets) {
    const { top, width, height } = target.getBoundingClientRect();
    // Skip `display: none` targets (e.g. a collapsed disclosure panel): they
    // have no layout box, so neither hiding nor triggering them makes sense.
    if (width === 0 && height === 0) continue;
    if (top < viewportBottom * 0.92) onScreen.push(target);
    else belowFold.push(target);
  }

  for (const target of onScreen) target.dataset.revealReady = "true";

  // Below-fold elements are invisible, so hiding them up front is free and
  // guarantees no flash of the pre-animation state when they scroll in.
  if (belowFold.length > 0) {
    gsap.set(belowFold, { opacity: 0, y: 26 });
    ScrollTrigger.batch(belowFold, {
      start: "top 88%",
      once: true,
      onEnter: (batch) => {
        for (const target of batch as HTMLElement[]) {
          target.dataset.revealReady = "true";
        }
        gsap.to(batch, {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: "power3.out",
          stagger: 0.08,
          overwrite: true,
        });
      },
    });

    // Safety net: if a trigger never fires (a zero-height box that later gains
    // height, an unsupported scroll container), force the elements visible
    // after a few seconds. Content must never stay hidden behind an animation.
    window.setTimeout(() => {
      for (const target of belowFold) {
        if (target.dataset.revealReady === "true") continue;
        const { top } = target.getBoundingClientRect();
        if (top < window.innerHeight) {
          target.dataset.revealReady = "true";
          gsap.to(target, {
            opacity: 1,
            y: 0,
            duration: 0.5,
            ease: "power2.out",
            overwrite: true,
          });
        }
      }
    }, 3200);
  }

  if (onScreen.length > 0) {
    gsap.fromTo(
      onScreen,
      { opacity: 0, y: 22 },
      {
        opacity: 1,
        y: 0,
        duration: 0.75,
        ease: "power3.out",
        stagger: 0.07,
        delay: 0.05,
        overwrite: true,
        clearProps: "transform,opacity,visibility",
      },
    );
  }
}

/**
 * The hero copy intro is a pure-CSS animation (see `hero-copy-enter` in
 * global.css) so it plays before JavaScript loads. Only the scroll-linked
 * parallax lives here.
 */
function animateHero(gsap: Gsap) {
  const hero = document.querySelector<HTMLElement>(".hero-section");
  if (!hero) return;

  // Slow drift on the photo layer as the hero leaves the viewport: reads as
  // depth rather than a bounce, and never moves the copy off its baseline.
  const photo = hero.querySelector<HTMLElement>(".hero-photo");
  if (photo) {
    gsap.fromTo(
      photo,
      { yPercent: -3 },
      {
        yPercent: 5,
        ease: "none",
        scrollTrigger: {
          trigger: hero,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      },
    );
  }
}

/** Subtle pointer-tracked lift on cards, the React-Bits style "tilt". */
function addCardTilt(gsap: Gsap): () => void {
  const cards = gsap.utils.toArray<HTMLElement>("[data-tilt]");
  if (cards.length === 0) return () => {};
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    return () => {};
  }

  const teardowns: Array<() => void> = [];

  for (const card of cards) {
    const setX = gsap.quickTo(card, "rotateY", { duration: 0.4, ease: "power2.out" });
    const setY = gsap.quickTo(card, "rotateX", { duration: 0.4, ease: "power2.out" });

    const onEnter = () => {
      // Perspective is only applied while the pointer is over the card. Writing
      // it up front would leave an inline transform on every tilt target, which
      // creates a stacking context and a compositor layer for each one.
      gsap.set(card, { transformPerspective: 900 });
    };
    const onMove = (event: PointerEvent) => {
      const rect = card.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      setX(px * 6);
      setY(py * -6);
    };
    const onLeave = () => {
      setX(0);
      setY(0);
      gsap.set(card, { clearProps: "transform" });
    };

    card.addEventListener("pointerenter", onEnter);
    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerleave", onLeave);
    teardowns.push(() => {
      card.removeEventListener("pointerenter", onEnter);
      card.removeEventListener("pointermove", onMove);
      card.removeEventListener("pointerleave", onLeave);
      gsap.set(card, { clearProps: "transform" });
    });
  }

  // The listeners are plain DOM handlers, so `gsap.context.revert()` cannot undo
  // them; the caller must invoke this on teardown or a later hover would write
  // the transform straight back after the layer was supposed to be off.
  return () => teardowns.forEach((fn) => fn());
}
