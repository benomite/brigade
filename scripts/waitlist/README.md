# scripts/waitlist — the waiting list for cloud stations (#3271)

The site (`site/`, GitHub Pages) is static, so it has no backend. The form on `site/index.html` (`#cloud`) posts to this small service, which has no dependency (Node 26, `node:sqlite`).

- **Stored**: the email (trimmed, lower case) and the signup timestamp (UTC, ISO 8601), nothing else. The email is the primary key: signing up twice keeps one row, keeps the first date, and answers the person exactly as the first time.
- **Run it** on a machine of yours: `WAITLIST_DB=/path/waitlist.sqlite PORT=8787 node scripts/waitlist/server.mjs`. `WAITLIST_ORIGIN` (default `https://benomite.github.io`) is the only site allowed to post from a browser.
- **Point the site at it**: set `data-endpoint` on the form in `site/index.html` to the public URL of `POST /signup`. Left empty, the form says the signup is not open yet and sends nothing.
- **The chef's view, one means**: `node scripts/waitlist/report.mjs /path/waitlist.sqlite` prints the total, then the date and email of each signup. It reads the file on the machine that holds it.
- **Not public**: the service has one route, `POST /signup`. It never returns an email or the count, and nothing else serves the file.
- **Check**: `cd runtime && node --test test/waitlist/waitlist.test.ts` signs up over HTTP, then reads the report.
