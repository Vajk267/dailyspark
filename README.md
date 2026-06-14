# DailySpark

Onfrissito hirportal prototipus. RSS-forrasokbol DailySpark-cikkeket keszit,
majd cimlapon, kulon cikkoldalon es AI overview oldalon jeleniti meg oket.

## Helyi futtatas

Ebben a Codex workspace-ben a beepitett Python hasznalhato:

```powershell
C:\Users\Vajk\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe scripts/fetch_news.py
C:\Users\Vajk\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m http.server 8000
```

Ezutan:

```text
http://localhost:8000
```

## Netlify automatizalas

A Netlify-os frissites a `netlify/functions` mappaban van.

- `refresh-news-early.mjs`: hajnali frissites, 04:25 Europe/Budapest ido szerint.
- `refresh-news-day.mjs`: napi frissitesek, 08:00, 14:00 es 20:00 Europe/Budapest ido szerint.
- `preview-news.mjs`: kezi probahivas, nem irja at a repot.

A Netlify cron UTC-ben fut, ezert a functionok tobb UTC idopontban ebrednek,
majd belul ellenorzik, hogy Budapest szerint tenyleg a kert idopont van-e. Igy
a nyari/teli idoszamitas valtasnal is a helyi idopont marad a lenyeg.

A Netlify build a `scripts/build-static.mjs` scriptet futtatja, es csak a
statikus oldalhoz szukseges fajlokat masolja a `dist` mappaba. Igy a function
forrasfajlok nem kerulnek ki statikus publikus fajlkent.

### Szukseges Netlify kornyezeti valtozok

A deployolt Netlify function nem tud tartosan fajlt irni a sajat futasi
kornyezetebe. Ezert a frissites a GitHub API-n keresztul commitolja az uj
`data/news.json` fajlt, ami elinditja a kovetkezo Netlify deployt.

Allitsd be ezeket a Netlify UI-ban, Functions scope-pal:

```text
NEWS_GITHUB_REPO=owner/repo
NEWS_GITHUB_TOKEN=github_token_contents_read_write_joggal
NEWS_GITHUB_BRANCH=main
NEWS_DATA_PATH=data/news.json
```

A `NEWS_GITHUB_BRANCH` es `NEWS_DATA_PATH` opcionalis, ha `main` branchon es
`data/news.json` utvonalon hasznalod.

### Kezi teszt Netlify-on

Preview, commit nelkul:

```text
https://your-site.netlify.app/.netlify/functions/preview-news
```

Kenyszeritett eles frissites, GitHub commit-tal:

```text
https://your-site.netlify.app/.netlify/functions/refresh-news-day?force=1
```

## Regi helyi scheduler

A helyi Python scheduler tovabbra is hasznalhato, ha nem Netlify-on futtatod:

```powershell
python scripts/scheduler.py
```

Netlify-on viszont a `netlify/functions` alatti Scheduled Functions a javasolt
megoldas.
