import { beforeAll } from "vitest";
import { preloadDynamicImports } from "./next-dynamic";

// Nachgeladene Komponenten (next/dynamic) vor den Tests bereitstellen, siehe test-support/next-dynamic.tsx.
beforeAll(() => preloadDynamicImports());
