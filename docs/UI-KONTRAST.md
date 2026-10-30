# UI: Kontrastmessung

Erzeugt von `node scripts/check-contrast.mjs --write` aus `app/globals.css` (WCAG 2.x; Text ≥ 4.5:1, ab 24 px ≥ 3:1). Alle Paare bestehen.

| Paar | Vordergrund | Hintergrund | Verhältnis | Soll | Ergebnis |
|---|---|---|---|---|---|
| hell: --text auf --bg | `#0b1620` | `#f4f7f9` | 16.98 | 4.5 | ok |
| hell: --text auf --surface | `#0b1620` | `#ffffff` | 18.26 | 4.5 | ok |
| hell: --text auf --surface-2 | `#0b1620` | `#eef3f6` | 16.34 | 4.5 | ok |
| hell: --text-2 auf --bg | `#26323f` | `#f4f7f9` | 12.12 | 4.5 | ok |
| hell: --text-2 auf --surface | `#26323f` | `#ffffff` | 13.04 | 4.5 | ok |
| hell: --text-2 auf --surface-2 | `#26323f` | `#eef3f6` | 11.67 | 4.5 | ok |
| hell: --text-muted auf --bg | `#44525f` | `#f4f7f9` | 7.46 | 4.5 | ok |
| hell: --text-muted auf --surface | `#44525f` | `#ffffff` | 8.02 | 4.5 | ok |
| hell: --text-muted auf --surface-2 | `#44525f` | `#eef3f6` | 7.18 | 4.5 | ok |
| hell: --text-subtle auf --bg | `#53616f` | `#f4f7f9` | 5.90 | 4.5 | ok |
| hell: --text-subtle auf --surface | `#53616f` | `#ffffff` | 6.35 | 4.5 | ok |
| hell: --text-subtle auf --surface-2 | `#53616f` | `#eef3f6` | 5.68 | 4.5 | ok |
| hell: --text-faint auf --bg | `#5d6b79` | `#f4f7f9` | 5.08 | 4.5 | ok |
| hell: --text-faint auf --surface | `#5d6b79` | `#ffffff` | 5.46 | 4.5 | ok |
| hell: --text-faint auf --surface-2 | `#5d6b79` | `#eef3f6` | 4.89 | 4.5 | ok |
| hell: --accent-text auf --bg | `#3f49b8` | `#f4f7f9` | 6.83 | 4.5 | ok |
| hell: --accent-text auf --surface | `#3f49b8` | `#ffffff` | 7.35 | 4.5 | ok |
| hell: --on-accent auf --accent | `#ffffff` | `#4f5bd5` | 5.54 | 4.5 | ok |
| hell: --accent-text auf --surface-2 | `#3f49b8` | `#eef3f6` | 6.58 | 4.5 | ok |
| hell: --accent-text auf --hero | `#3f49b8` | `#f0f1fc` | 6.54 | 4.5 | ok |
| hell: --text auf --hero | `#0b1620` | `#f0f1fc` | 16.26 | 4.5 | ok |
| hell: --text-muted auf --hero | `#44525f` | `#f0f1fc` | 7.14 | 4.5 | ok |
| hell: --success-text auf --surface | `#067552` | `#ffffff` | 5.72 | 4.5 | ok |
| hell: --success-text auf --bg | `#067552` | `#f4f7f9` | 5.31 | 4.5 | ok |
| hell: --on-success auf --success | `#03140d` | `#0e9f73` | 5.61 | 4.5 | ok |
| hell: --on-danger auf --danger | `#1a0805` | `#d9503f` | 4.78 | 4.5 | ok |
| hell: --info-text auf --bg | `#17648f` | `#f4f7f9` | 5.99 | 4.5 | ok |
| hell: --warning-text auf --bg | `#83580a` | `#f4f7f9` | 5.80 | 4.5 | ok |
| hell: --danger-text auf --bg | `#ae3a2a` | `#f4f7f9` | 5.68 | 4.5 | ok |
| hell: --text-faint auf --surface-inset | `#5d6b79` | `#e8eef2` | 4.67 | 4.5 | ok |
| hell: --chart-data auf --surface | `#5e7fa8` | `#ffffff` | 4.14 | 3 | ok |
| hell: --accent auf --surface | `#4f5bd5` | `#ffffff` | 5.54 | 3 | ok |
| hell: --success auf --surface | `#0e9f73` | `#ffffff` | 3.37 | 3 | ok |
| hell: --info-text auf --surface | `#17648f` | `#ffffff` | 6.45 | 4.5 | ok |
| hell: --warning-text auf --surface | `#83580a` | `#ffffff` | 6.24 | 4.5 | ok |
| hell: --danger-text auf --surface | `#ae3a2a` | `#ffffff` | 6.11 | 4.5 | ok |
| hell: --violet auf --surface | `#7c5ce0` | `#ffffff` | 4.70 | 3 | ok |
| dunkel: --text auf --bg | `#e8eef4` | `#0a1118` | 16.24 | 4.5 | ok |
| dunkel: --text auf --surface | `#e8eef4` | `#101a24` | 15.03 | 4.5 | ok |
| dunkel: --text auf --surface-2 | `#e8eef4` | `#15212d` | 13.96 | 4.5 | ok |
| dunkel: --text-2 auf --bg | `#c7d2dd` | `#0a1118` | 12.38 | 4.5 | ok |
| dunkel: --text-2 auf --surface | `#c7d2dd` | `#101a24` | 11.45 | 4.5 | ok |
| dunkel: --text-2 auf --surface-2 | `#c7d2dd` | `#15212d` | 10.64 | 4.5 | ok |
| dunkel: --text-muted auf --bg | `#a9b6c4` | `#0a1118` | 9.20 | 4.5 | ok |
| dunkel: --text-muted auf --surface | `#a9b6c4` | `#101a24` | 8.51 | 4.5 | ok |
| dunkel: --text-muted auf --surface-2 | `#a9b6c4` | `#15212d` | 7.90 | 4.5 | ok |
| dunkel: --text-subtle auf --bg | `#93a1b1` | `#0a1118` | 7.21 | 4.5 | ok |
| dunkel: --text-subtle auf --surface | `#93a1b1` | `#101a24` | 6.67 | 4.5 | ok |
| dunkel: --text-subtle auf --surface-2 | `#93a1b1` | `#15212d` | 6.19 | 4.5 | ok |
| dunkel: --text-faint auf --bg | `#8493a4` | `#0a1118` | 6.05 | 4.5 | ok |
| dunkel: --text-faint auf --surface | `#8493a4` | `#101a24` | 5.60 | 4.5 | ok |
| dunkel: --text-faint auf --surface-2 | `#8493a4` | `#15212d` | 5.20 | 4.5 | ok |
| dunkel: --accent-text auf --bg | `#a9afff` | `#0a1118` | 9.28 | 4.5 | ok |
| dunkel: --accent-text auf --surface | `#a9afff` | `#101a24` | 8.59 | 4.5 | ok |
| dunkel: --on-accent auf --accent | `#0b0f2a` | `#8b93f8` | 6.83 | 4.5 | ok |
| dunkel: --accent-text auf --surface-2 | `#a9afff` | `#15212d` | 7.97 | 4.5 | ok |
| dunkel: --accent-text auf --hero | `#a9afff` | `#13172c` | 8.65 | 4.5 | ok |
| dunkel: --text auf --hero | `#e8eef4` | `#13172c` | 15.14 | 4.5 | ok |
| dunkel: --text-muted auf --hero | `#a9b6c4` | `#13172c` | 8.58 | 4.5 | ok |
| dunkel: --success-text auf --surface | `#62d3ae` | `#101a24` | 9.58 | 4.5 | ok |
| dunkel: --success-text auf --bg | `#62d3ae` | `#0a1118` | 10.35 | 4.5 | ok |
| dunkel: --on-success auf --success | `#03140d` | `#3cc79a` | 8.86 | 4.5 | ok |
| dunkel: --on-danger auf --danger | `#1a0805` | `#ff7b6b` | 7.68 | 4.5 | ok |
| dunkel: --info-text auf --bg | `#85cbf0` | `#0a1118` | 10.66 | 4.5 | ok |
| dunkel: --warning-text auf --bg | `#f7c266` | `#0a1118` | 11.63 | 4.5 | ok |
| dunkel: --danger-text auf --bg | `#ff9c8f` | `#0a1118` | 9.40 | 4.5 | ok |
| dunkel: --text-faint auf --surface-inset | `#8493a4` | `#0b131b` | 5.96 | 4.5 | ok |
| dunkel: --chart-data auf --surface | `#6f8db5` | `#101a24` | 5.15 | 3 | ok |
| dunkel: --accent auf --surface | `#8b93f8` | `#101a24` | 6.38 | 3 | ok |
| dunkel: --success auf --surface | `#3cc79a` | `#101a24` | 8.22 | 3 | ok |
| dunkel: --info-text auf --surface | `#85cbf0` | `#101a24` | 9.87 | 4.5 | ok |
| dunkel: --warning-text auf --surface | `#f7c266` | `#101a24` | 10.76 | 4.5 | ok |
| dunkel: --danger-text auf --surface | `#ff9c8f` | `#101a24` | 8.70 | 4.5 | ok |
| dunkel: --violet auf --surface | `#c9a2ff` | `#101a24` | 8.45 | 3 | ok |
| hell, Kontext persönlich: --ctx-link auf --bg | `#3f49b8` | `#f4f7f9` | 6.83 | 4.5 | ok |
| hell, Kontext persönlich: --ctx-link auf --surface | `#3f49b8` | `#ffffff` | 7.35 | 4.5 | ok |
| hell, Kontext persönlich: --ctx-on-accent auf --ctx-accent | `#ffffff` | `#4f5bd5` | 5.54 | 4.5 | ok |
| hell, Kontext persönlich: --ctx-label auf --ctx-sidebar | `#5d6b79` | `#ffffff` | 5.46 | 4.5 | ok |
| dunkel, Kontext persönlich: --ctx-link auf --bg | `#a9afff` | `#0a1118` | 9.28 | 4.5 | ok |
| dunkel, Kontext persönlich: --ctx-link auf --surface | `#a9afff` | `#101a24` | 8.59 | 4.5 | ok |
| dunkel, Kontext persönlich: --ctx-on-accent auf --ctx-accent | `#0b0f2a` | `#8b93f8` | 6.83 | 4.5 | ok |
| dunkel, Kontext persönlich: --ctx-label auf --ctx-sidebar | `#8493a4` | `#0c141c` | 5.91 | 4.5 | ok |
| hell, Kontext firma: --ctx-link auf --bg | `#3f49b8` | `#f4f7f9` | 6.83 | 4.5 | ok |
| hell, Kontext firma: --ctx-link auf --surface | `#3f49b8` | `#ffffff` | 7.35 | 4.5 | ok |
| hell, Kontext firma: --ctx-on-accent auf --ctx-accent | `#ffffff` | `#4f5bd5` | 5.54 | 4.5 | ok |
| hell, Kontext firma: --ctx-label auf --ctx-sidebar | `#5d6b79` | `#ffffff` | 5.46 | 4.5 | ok |
| dunkel, Kontext firma: --ctx-link auf --bg | `#a9afff` | `#0a1118` | 9.28 | 4.5 | ok |
| dunkel, Kontext firma: --ctx-link auf --surface | `#a9afff` | `#101a24` | 8.59 | 4.5 | ok |
| dunkel, Kontext firma: --ctx-on-accent auf --ctx-accent | `#0b0f2a` | `#8b93f8` | 6.83 | 4.5 | ok |
| dunkel, Kontext firma: --ctx-label auf --ctx-sidebar | `#8493a4` | `#0c141c` | 5.91 | 4.5 | ok |
| hell, Kontext admin: --ctx-link auf --bg | `#3f49b8` | `#f4f7f9` | 6.83 | 4.5 | ok |
| hell, Kontext admin: --ctx-link auf --surface | `#3f49b8` | `#ffffff` | 7.35 | 4.5 | ok |
| hell, Kontext admin: --ctx-on-accent auf --ctx-accent | `#ffffff` | `#4f5bd5` | 5.54 | 4.5 | ok |
| hell, Kontext admin: --ctx-label auf --ctx-sidebar | `#5d6b79` | `#ffffff` | 5.46 | 4.5 | ok |
| dunkel, Kontext admin: --ctx-link auf --bg | `#a9afff` | `#0a1118` | 9.28 | 4.5 | ok |
| dunkel, Kontext admin: --ctx-link auf --surface | `#a9afff` | `#101a24` | 8.59 | 4.5 | ok |
| dunkel, Kontext admin: --ctx-on-accent auf --ctx-accent | `#0b0f2a` | `#8b93f8` | 6.83 | 4.5 | ok |
| dunkel, Kontext admin: --ctx-label auf --ctx-sidebar | `#8493a4` | `#0c141c` | 5.91 | 4.5 | ok |
