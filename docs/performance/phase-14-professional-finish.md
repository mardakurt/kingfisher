# Phase 14 — professional finish without a performance tax

Phase 14 changed the workstation chrome and added four chess interactions. The
comparison below runs the same Playwright timing harness three times against
the reported Phase 13 HEAD (`4cb8b99`) and the Phase 14 tree on the same
machine, dev server and Chrome. Medians are reported; the first run in each
checkout was deliberately retained as warm-up noise rather than discarded.

| Interaction                                            | Phase 13 | Phase 14 |  Change |
| ------------------------------------------------------ | -------: | -------: | ------: |
| Fresh route to hydrated, visible board                 | 465.4 ms | 466.9 ms | +1.5 ms |
| Bundled reference ready from the same fresh navigation | 483.7 ms | 486.3 ms | +2.6 ms |
| Explorer selected to first factual `e4` result         | 921.5 ms | 923.0 ms | +1.5 ms |
| Explorer → Engine tool switch                          |  53.3 ms |  46.0 ms | −7.3 ms |
| Settings click to visible dialog                       | 836.6 ms | 837.1 ms | +0.5 ms |

These absolute Explorer and Settings numbers include a fresh browser context,
dynamic module startup and the dev server. They intentionally differ from the
warm-module figures in the Phase 13 report. The comparison is meaningful
because both commits were measured with the identical harness and dependencies.

## Initial route JavaScript

Production builds measured with `npm run bundle:report`:

| Bundle                          |   Phase 13 |   Phase 14 |  Change |
| ------------------------------- | ---------: | ---------: | ------: |
| `/analysis`, gzip               |   332.8 kB |   334.6 kB | +1.8 kB |
| Heaviest route (`/review`)      |   345.6 kB |   347.3 kB | +1.7 kB |
| Total emitted client JS         | 3,177.5 kB | 3,171.4 kB | −6.1 kB |
| Emitted client JavaScript files |         95 |         96 |      +1 |

Position setup is a conditionally mounted dynamic import. Play From Here is a
lazy workspace tool. Neither is paid for by a player who only opens Analysis.

## Board and large-tree protection

The Analysis board remains 453, 501, 583, 763 and 960 pixels at the 1280×720,
1366×768, 1440×900, 1920×1080 and 2560×1440 viewports respectively. The final
20,000-node browser run created and saved the tree in 87 ms, reloaded and
rendered it in 341 ms, and completed End/Home/Right navigation in 132 ms while
keeping fewer than 100 rows mounted.

`npm run benchmark` also kept the non-visual scale paths inside their existing
budgets: the 100,000-game parser completed in 38.5 seconds, the exact filtered
cache in 217 ms, structure search in 33 ms, and selective deletion in 392 ms.
