# Reading in other apps

refusion speaks the Fever API, so apps such as Reeder, Unread and FeedMe can sync with it.

## Connect an app

Add a **Fever** account in the app and enter:

- **Server:** your refusion address, such as `https://rss.example.com` or `http://192.168.1.10:8080`.
- **Username:** the value of `FUSION_FEVER_USERNAME` (see [`.env.example`](../.env.example) for the default).
- **Password:** your refusion password, `FUSION_PASSWORD`.

Most apps need only the address. If yours asks for the full endpoint, try `/fever`, then `/fever/`, then `/fever.php` after the address.

Fever is off when you sign in with OIDC and have no password set.

## Check the login without an app

The app logs in with an `api_key`, the MD5 of `username:password`. Compute it with `md5 -q -s 'fusion:your_password'` on macOS or `printf 'fusion:your_password' | md5sum | cut -d' ' -f1` on Linux, then:

```bash
curl -sS -X POST 'https://rss.example.com/fever' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'api=1&api_key=<the md5>'
```

The reply contains `"auth":1` when the login works.

## Behind a reverse proxy

Forward `POST /fever*` to refusion unchanged. Starred articles in the app are refusion's stars, and articles hidden by filters don't reach the app. What the API covers: [`.agents/notes/fever-api.md`](../.agents/notes/fever-api.md).
