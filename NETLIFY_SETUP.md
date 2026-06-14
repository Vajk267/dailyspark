# Netlify setup checklist

## What is already prepared

- Netlify Scheduled Functions are in `netlify/functions`.
- Fresh generated news is persisted in Netlify Blobs.
- The frontend reads `/.netlify/functions/latest-news` and falls back to `data/news.json`.
- Static build output is generated into `dist`.
- The schedule targets Budapest local time:
  - 04:25
  - 08:00
  - 14:00
  - 20:00

## What still requires account access

1. Log in to Netlify CLI.
2. Create or link a Netlify site.
3. Deploy:

```text
netlify deploy --prod
```

4. Test:

```text
https://your-site.netlify.app/.netlify/functions/preview-news
https://your-site.netlify.app/.netlify/functions/refresh-news-day?force=1
https://your-site.netlify.app/.netlify/functions/latest-news
```

The preview endpoint generates news without saving it. The forced refresh endpoint
saves the latest edition to Netlify Blobs. The latest-news endpoint serves the
saved Blob data to the frontend.
