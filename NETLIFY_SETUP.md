# Netlify setup checklist

## What is already prepared

- Netlify Scheduled Functions are in `netlify/functions`.
- Static build output is generated into `dist`.
- The schedule targets Budapest local time:
  - 04:25
  - 08:00
  - 14:00
  - 20:00

## What still requires account access

1. Put this project in a GitHub repository.
2. Connect that repository to a Netlify site.
3. Set these Netlify environment variables with Functions scope:

```text
NEWS_GITHUB_REPO=owner/repo
NEWS_GITHUB_TOKEN=github_token_with_contents_read_write
NEWS_GITHUB_BRANCH=main
NEWS_DATA_PATH=data/news.json
```

4. Deploy the Netlify site.
5. Test:

```text
https://your-site.netlify.app/.netlify/functions/preview-news
https://your-site.netlify.app/.netlify/functions/refresh-news-day?force=1
```

The preview endpoint generates news without committing. The forced refresh endpoint commits
`data/news.json` through GitHub, so it needs the token to be configured first.
