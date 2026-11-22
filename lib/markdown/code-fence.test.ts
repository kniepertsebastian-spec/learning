import { describe, expect, it } from "vitest";
import { hasHighlightableCode } from "./code-fence";

describe("hasHighlightableCode", () => {
  it("erkennt Codeblöcke mit Sprachangabe (Backticks, Tilden, eingerückt, im Zitat)", () => {
    expect(hasHighlightableCode("```bash\nls\n```")).toBe(true);
    expect(hasHighlightableCode("Text\n\n~~~yaml\na: 1\n~~~")).toBe(true);
    expect(hasHighlightableCode("Liste:\n  ```python\n  x = 1\n  ```")).toBe(true);
    expect(hasHighlightableCode("> ```json\n> {}\n> ```")).toBe(true);
    expect(hasHighlightableCode("```c#\nvar x;\n```")).toBe(true);
    expect(hasHighlightableCode("```console\n$ ls\n```")).toBe(true); // Terminal: großzügig, schadet nicht
  });

  it("ignoriert Text ohne Codeblock oder ohne Sprachangabe", () => {
    expect(hasHighlightableCode("Nur `inline` Code und Text.")).toBe(false);
    expect(hasHighlightableCode("```\nohne Sprache\n```")).toBe(false);
    expect(hasHighlightableCode("Das kostet ``` nicht am Zeilenanfang")).toBe(false);
  });
});
