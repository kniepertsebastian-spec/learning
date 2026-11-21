import * as React from "react";

/**
 * `next/dynamic` für vitest (Alias in vitest.config.ts). Die Komponententests rendern synchron mit renderToStaticMarkup, das
 * auf nachgeladene Chunks nicht wartet. Deshalb startet dieser Ersatz den Import sofort beim Definieren der Komponente, und
 * test-support/setup.ts wartet vor den Tests auf alle (preloadDynamicImports). Danach rendern die Komponenten wie ein
 * normaler Import, mit denselben Ausgaben wie im Server-Rendering von Next.js.
 */
type AnyComponent = React.ComponentType<Record<string, unknown>>;

const pending = new Set<Promise<unknown>>();

export default function dynamic(loader: () => Promise<unknown>): AnyComponent {
  let Loaded: AnyComponent | null = null;
  const promise = loader().then((mod) => {
    Loaded = (mod && typeof mod === "object" && "default" in mod ? (mod as { default: unknown }).default : mod) as AnyComponent;
  });
  pending.add(promise);
  function DynamicComponent(props: Record<string, unknown>) {
    if (!Loaded) throw new Error("next/dynamic im Test: Modul noch nicht geladen (preloadDynamicImports abwarten)");
    return React.createElement(Loaded, props);
  }
  return DynamicComponent;
}

/** Wartet, bis alle bisher definierten dynamischen Komponenten (auch die, die beim Laden neu dazukommen) geladen sind. */
export async function preloadDynamicImports(): Promise<void> {
  let seen = 0;
  while (pending.size !== seen) {
    seen = pending.size;
    await Promise.all([...pending]);
  }
}
