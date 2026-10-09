# UI: Kontrastmessung

Erzeugt von `node scripts/check-contrast.mjs --write` aus `app/globals.css` (WCAG 2.x; Text ≥ 4.5:1, ab 24 px ≥ 3:1). Alle Paare bestehen.

| Paar | Vordergrund | Hintergrund | Verhältnis | Soll | Ergebnis |
|---|---|---|---|---|---|
| hell: --text auf --bg | `#0e1218` | `#f6f7f9` | 17.52 | 4.5 | ok |
| hell: --text auf --surface | `#0e1218` | `#ffffff` | 18.78 | 4.5 | ok |
| hell: --text auf --surface-2 | `#0e1218` | `#f1f3f6` | 16.89 | 4.5 | ok |
| hell: --text-2 auf --bg | `#2a3140` | `#f6f7f9` | 12.15 | 4.5 | ok |
| hell: --text-2 auf --surface | `#2a3140` | `#ffffff` | 13.03 | 4.5 | ok |
| hell: --text-2 auf --surface-2 | `#2a3140` | `#f1f3f6` | 11.72 | 4.5 | ok |
| hell: --text-muted auf --bg | `#4a5466` | `#f6f7f9` | 7.12 | 4.5 | ok |
| hell: --text-muted auf --surface | `#4a5466` | `#ffffff` | 7.63 | 4.5 | ok |
| hell: --text-muted auf --surface-2 | `#4a5466` | `#f1f3f6` | 6.87 | 4.5 | ok |
| hell: --text-subtle auf --bg | `#5b6577` | `#f6f7f9` | 5.48 | 4.5 | ok |
| hell: --text-subtle auf --surface | `#5b6577` | `#ffffff` | 5.88 | 4.5 | ok |
| hell: --text-subtle auf --surface-2 | `#5b6577` | `#f1f3f6` | 5.29 | 4.5 | ok |
| hell: --text-faint auf --bg | `#626c7e` | `#f6f7f9` | 4.94 | 4.5 | ok |
| hell: --text-faint auf --surface | `#626c7e` | `#ffffff` | 5.30 | 4.5 | ok |
| hell: --text-faint auf --surface-2 | `#626c7e` | `#f1f3f6` | 4.76 | 4.5 | ok |
| hell: --accent-text auf --bg | `#0a7a55` | `#f6f7f9` | 4.99 | 4.5 | ok |
| hell: --accent-text auf --surface | `#0a7a55` | `#ffffff` | 5.35 | 4.5 | ok |
| hell: --on-accent auf --accent | `#04140d` | `#1fcb8f` | 9.00 | 4.5 | ok |
| hell: --info-text auf --surface | `#1d5fd1` | `#ffffff` | 5.82 | 4.5 | ok |
| hell: --warning-text auf --surface | `#8a5d06` | `#ffffff` | 5.75 | 4.5 | ok |
| hell: --danger-text auf --surface | `#b83e2b` | `#ffffff` | 5.58 | 4.5 | ok |
| hell: --violet auf --surface | `#8b5cf6` | `#ffffff` | 4.23 | 3 | ok |
| dunkel: --text auf --bg | `#e8ecf3` | `#0a0c10` | 16.52 | 4.5 | ok |
| dunkel: --text auf --surface | `#e8ecf3` | `#12161e` | 15.29 | 4.5 | ok |
| dunkel: --text auf --surface-2 | `#e8ecf3` | `#171d28` | 14.26 | 4.5 | ok |
| dunkel: --text-2 auf --bg | `#c9d0dc` | `#0a0c10` | 12.62 | 4.5 | ok |
| dunkel: --text-2 auf --surface | `#c9d0dc` | `#12161e` | 11.68 | 4.5 | ok |
| dunkel: --text-2 auf --surface-2 | `#c9d0dc` | `#171d28` | 10.89 | 4.5 | ok |
| dunkel: --text-muted auf --bg | `#aeb7c6` | `#0a0c10` | 9.68 | 4.5 | ok |
| dunkel: --text-muted auf --surface | `#aeb7c6` | `#12161e` | 8.96 | 4.5 | ok |
| dunkel: --text-muted auf --surface-2 | `#aeb7c6` | `#171d28` | 8.36 | 4.5 | ok |
| dunkel: --text-subtle auf --bg | `#9aa4b5` | `#0a0c10` | 7.78 | 4.5 | ok |
| dunkel: --text-subtle auf --surface | `#9aa4b5` | `#12161e` | 7.20 | 4.5 | ok |
| dunkel: --text-subtle auf --surface-2 | `#9aa4b5` | `#171d28` | 6.72 | 4.5 | ok |
| dunkel: --text-faint auf --bg | `#8c96a8` | `#0a0c10` | 6.56 | 4.5 | ok |
| dunkel: --text-faint auf --surface | `#8c96a8` | `#12161e` | 6.08 | 4.5 | ok |
| dunkel: --text-faint auf --surface-2 | `#8c96a8` | `#171d28` | 5.67 | 4.5 | ok |
| dunkel: --accent-text auf --bg | `#34e3a4` | `#0a0c10` | 11.81 | 4.5 | ok |
| dunkel: --accent-text auf --surface | `#34e3a4` | `#12161e` | 10.93 | 4.5 | ok |
| dunkel: --on-accent auf --accent | `#04140d` | `#34e3a4` | 11.40 | 4.5 | ok |
| dunkel: --info-text auf --surface | `#8dbbff` | `#12161e` | 9.22 | 4.5 | ok |
| dunkel: --warning-text auf --surface | `#f4b740` | `#12161e` | 10.09 | 4.5 | ok |
| dunkel: --danger-text auf --surface | `#ff9a8a` | `#12161e` | 8.83 | 4.5 | ok |
| dunkel: --violet auf --surface | `#c9a2ff` | `#12161e` | 8.71 | 3 | ok |
| hell, Kontext persönlich: --ctx-link auf --bg | `#0a7a55` | `#f6f7f9` | 4.99 | 4.5 | ok |
| hell, Kontext persönlich: --ctx-link auf --surface | `#0a7a55` | `#ffffff` | 5.35 | 4.5 | ok |
| hell, Kontext persönlich: --ctx-on-accent auf --ctx-accent | `#04140d` | `#1fcb8f` | 9.00 | 4.5 | ok |
| hell, Kontext persönlich: --ctx-label auf --ctx-sidebar | `#6b7588` | `#ffffff` | 4.64 | 4.5 | ok |
| dunkel, Kontext persönlich: --ctx-link auf --bg | `#34e3a4` | `#0a0c10` | 11.81 | 4.5 | ok |
| dunkel, Kontext persönlich: --ctx-link auf --surface | `#34e3a4` | `#12161e` | 10.93 | 4.5 | ok |
| dunkel, Kontext persönlich: --ctx-on-accent auf --ctx-accent | `#04140d` | `#34e3a4` | 11.40 | 4.5 | ok |
| dunkel, Kontext persönlich: --ctx-label auf --ctx-sidebar | `#8c96a8` | `#0e1117` | 6.34 | 4.5 | ok |
| hell, Kontext firma: --ctx-link auf --bg | `#8a5d06` | `#f6f7f9` | 5.37 | 4.5 | ok |
| hell, Kontext firma: --ctx-link auf --surface | `#8a5d06` | `#ffffff` | 5.75 | 4.5 | ok |
| hell, Kontext firma: --ctx-on-accent auf --ctx-accent | `#1a1204` | `#e3a21a` | 8.35 | 4.5 | ok |
| hell, Kontext firma: --ctx-label auf --ctx-sidebar | `#7a6532` | `#fffbf0` | 5.44 | 4.5 | ok |
| dunkel, Kontext firma: --ctx-link auf --bg | `#f4b740` | `#0a0c10` | 10.90 | 4.5 | ok |
| dunkel, Kontext firma: --ctx-link auf --surface | `#f4b740` | `#12161e` | 10.09 | 4.5 | ok |
| dunkel, Kontext firma: --ctx-on-accent auf --ctx-accent | `#1a1204` | `#f4b740` | 10.33 | 4.5 | ok |
| dunkel, Kontext firma: --ctx-label auf --ctx-sidebar | `#b8a47a` | `#100f0b` | 7.88 | 4.5 | ok |
| hell, Kontext admin: --ctx-link auf --bg | `#b83e2b` | `#f6f7f9` | 5.21 | 4.5 | ok |
| hell, Kontext admin: --ctx-link auf --surface | `#b83e2b` | `#ffffff` | 5.58 | 4.5 | ok |
| hell, Kontext admin: --ctx-on-accent auf --ctx-accent | `#1a0805` | `#e85a45` | 5.53 | 4.5 | ok |
| hell, Kontext admin: --ctx-label auf --ctx-sidebar | `#8f4f45` | `#ffffff` | 6.23 | 4.5 | ok |
| dunkel, Kontext admin: --ctx-link auf --bg | `#ff9a8a` | `#0a0c10` | 9.54 | 4.5 | ok |
| dunkel, Kontext admin: --ctx-link auf --surface | `#ff9a8a` | `#12161e` | 8.83 | 4.5 | ok |
| dunkel, Kontext admin: --ctx-on-accent auf --ctx-accent | `#1a0805` | `#ff7a66` | 7.61 | 4.5 | ok |
| dunkel, Kontext admin: --ctx-label auf --ctx-sidebar | `#c0928a` | `#0e1117` | 6.95 | 4.5 | ok |
