# SVG Motion Animation Runbook

Use this note when an SVG background animation works after HMR but stops after a hard refresh, especially when animating large blurred SVG shapes.

## Symptom

- Animation starts after a hot module reload.
- Animation does not start after `Ctrl+Shift+R` or a fresh page load.
- `prefers-reduced-motion` is `false`.
- The same animation may behave differently across Chromium and Firefox-based browsers.

## Root Issue

This is not specifically a React problem.

The fragile part is browser SVG transform handling. Large root `<svg>` elements do not behave as predictably as normal HTML elements when they are moved, scaled, blurred, and repeatedly animated. React, Motion, and HMR can expose the problem, but the same pattern can fail in Solid, Vue, Svelte, or vanilla JavaScript if the animation is applied directly to the SVG root.

The risky pattern is putting repeating `x`, `y`, or `scale` animations directly on a large root SVG element, for example `motion.svg`.

SVG transform handling is less predictable across browsers than CSS transforms on normal HTML elements. The problem becomes easier to trigger when the SVG is:

- absolutely positioned,
- very large relative to its container,
- blurred or filtered,
- mounted during hydration,
- animated with infinite keyframes.

HMR can hide the issue because the framework and animation library may preserve enough state for the animation to keep running. A hard refresh remounts everything from scratch, so the broken startup path appears again.

In the Baresync docs case, `prefers-reduced-motion` was `false`, so the browser was not intentionally disabling motion. The animation became reliable only after moving the transform animation from the SVG root to a normal `motion.div` wrapper.

## Fix Pattern

Animate a normal wrapper element and render the SVG inside it.

```tsx
<motion.div
  animate={controls}
  className="absolute transform-gpu blur-[118px] will-change-transform"
  initial={{ opacity: 0.54, scale: 1, x: 0, y: 0 }}
  style={{ color: "rgba(184, 255, 87, 0.92)", filter: "blur(108px)" }}
>
  <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 1440 560">
    <path d={path} fill="currentColor" />
  </svg>
</motion.div>
```

For stubborn startup cases, start the animation imperatively after mount:

```tsx
const controls = useAnimationControls();

useEffect(() => {
  if (reduceMotion) {
    controls.set({ opacity: 0.54, scale: 1, x: 0, y: 0 });
    return;
  }

  const frameId = window.requestAnimationFrame(() => {
    controls.start({
      opacity: [0.54, 0.68, 0.58, 0.54],
      scale: [1, 1.08, 0.94, 1],
      x: [0, 180, -145, 0],
      y: [0, -142, 112, 0],
      transition: {
        duration: 4.8,
        ease: "easeInOut",
        repeat: Number.POSITIVE_INFINITY,
      },
    });
  });

  return () => {
    window.cancelAnimationFrame(frameId);
    controls.stop();
  };
}, [controls, reduceMotion]);
```

## Debug Checklist

1. Add a temporary dev-only log for `prefers-reduced-motion`.
2. Test with a hard refresh, not only HMR.
3. Remove blur temporarily to confirm the shape is moving.
4. Put the blur back and increase travel distance if the motion becomes too subtle.
5. Move animation from `motion.svg` to a `motion.div` wrapper if Chromium or Firefox behaves inconsistently.
6. Remove temporary logs before committing.

## Current Baresync Example

The docs QuickStart aurora background uses this pattern in:

`apps/docs/src/components/aurora-background.tsx`
