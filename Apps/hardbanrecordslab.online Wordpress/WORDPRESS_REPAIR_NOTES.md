# HardbanRecords Lab WordPress Repair

Live check on 2026-05-17:

- `https://hardbanrecordslab.online` does not resolve to an A/AAAA record.
- `https://www.hardbanrecordslab.online` resolves, but WordPress returns HTTP 500 with "There has been a critical error on this website."

Prepared fix:

- `wp-content/mu-plugins/hrl-emergency-repair.php`

Deploy path on the server:

```text
wp-content/mu-plugins/hrl-emergency-repair.php
```

What it does:

- Forces WordPress URL generation to `https://www.hardbanrecordslab.online` until apex DNS is fixed.
- Blocks legacy SSO/app redirects.
- Filters out likely SSO/login redirect plugins.
- Adds optional safe mode via `define('HRL_WP_SAFE_MODE', true);` in `wp-config.php`.
- Adds fallback shortcodes:
  - `[hrl_contact_form]`
  - `[hrl_radio_embed]`
  - `[hrl_membership_levels]`

If the site still returns HTTP 500 after deploying the mu-plugin, enable:

```php
define('HRL_WP_SAFE_MODE', true);
```

in `wp-config.php`, then reload `https://www.hardbanrecordslab.online/wp-admin/`.

DNS follow-up:

- Add A/AAAA or CNAME records for the apex `hardbanrecordslab.online`, or redirect apex to `www` at Cloudflare.
