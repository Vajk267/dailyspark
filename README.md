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
- `latest-news.mjs`: az oldal altal olvasott aktualis hiradat.

A Netlify cron UTC-ben fut, ezert a functionok tobb UTC idopontban ebrednek,
majd belul ellenorzik, hogy Budapest szerint tenyleg a kert idopont van-e. Igy
a nyari/teli idoszamitas valtasnal is a helyi idopont marad a lenyeg.

A Netlify build a `scripts/build-static.mjs` scriptet futtatja, es csak a
statikus oldalhoz szukseges fajlokat masolja a `dist` mappaba. Igy a function
forrasfajlok nem kerulnek ki statikus publikus fajlkent.

### Adattarolas

A friss hirek Netlify Blobs tarhelyre kerulnek. Az oldal eloszor a
`/.netlify/functions/latest-news` endpointot olvassa, helyi fejlesztesnel pedig
visszaesik a statikus `data/news.json` fajlra. Ehhez nincs szukseg GitHub
tokenre.

### Kezi teszt Netlify-on

Preview, commit nelkul:

```text
https://your-site.netlify.app/.netlify/functions/preview-news
```

Kenyszeritett eles frissites:

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
