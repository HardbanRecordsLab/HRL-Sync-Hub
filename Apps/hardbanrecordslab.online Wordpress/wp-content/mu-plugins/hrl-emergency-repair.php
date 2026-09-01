<?php
/**
 * Plugin Name: HRL Emergency WordPress Repair
 * Description: Emergency recovery layer for HardbanRecords Lab WordPress. Disables legacy SSO redirects, stabilizes canonical URLs, and provides safe fallbacks while the site is recovered.
 * Author: HardbanRecords Lab
 * Version: 2026.05.17
 */

if (!defined('ABSPATH')) {
    exit;
}

const HRL_CANONICAL_HOME = 'https://www.hardbanrecordslab.online';

/**
 * The apex domain currently has no A/AAAA record, while www resolves through
 * Cloudflare. Keep WordPress URL generation on www until DNS is corrected.
 */
add_filter('pre_option_home', static function () {
    return HRL_CANONICAL_HOME;
});

add_filter('pre_option_siteurl', static function () {
    return HRL_CANONICAL_HOME;
});

/**
 * Legacy SSO mu-plugins caused app redirect loops earlier in the ecosystem.
 * Keep normal WP login/admin behavior local to WordPress.
 */
add_filter('wp_redirect', static function ($location) {
    if (!is_string($location) || $location === '') {
        return $location;
    }

    $blocked = array(
        'app.hrl-sync-hub',
        'app-course-hub',
        'app-omnipost',
        'hrl-access.hardbanrecordslab.online/api/auth/sso',
        '?redirect_to=',
    );

    foreach ($blocked as $needle) {
        if (stripos($location, $needle) !== false) {
            return admin_url();
        }
    }

    return $location;
}, 1);

/**
 * Optional safe mode: add define('HRL_WP_SAFE_MODE', true); to wp-config.php
 * if production still fatals after this mu-plugin is deployed. This disables
 * regular plugins while keeping mu-plugins available.
 */
add_filter('option_active_plugins', static function ($plugins) {
    if (defined('HRL_WP_SAFE_MODE') && HRL_WP_SAFE_MODE) {
        return array();
    }

    if (!is_array($plugins)) {
        return $plugins;
    }

    return array_values(array_filter($plugins, static function ($plugin) {
        $blocked = array(
            'hrl-sso',
            'sso-redirect',
            'jwt-authentication-for-wp-rest-api',
            'wp-force-login',
        );

        foreach ($blocked as $needle) {
            if (stripos($plugin, $needle) !== false) {
                return false;
            }
        }

        return true;
    }));
}, 1);

add_filter('site_option_active_sitewide_plugins', static function ($plugins) {
    if (defined('HRL_WP_SAFE_MODE') && HRL_WP_SAFE_MODE) {
        return array();
    }

    if (!is_array($plugins)) {
        return $plugins;
    }

    foreach (array_keys($plugins) as $plugin) {
        if (stripos($plugin, 'hrl-sso') !== false || stripos($plugin, 'sso-redirect') !== false) {
            unset($plugins[$plugin]);
        }
    }

    return $plugins;
}, 1);

/**
 * If the active theme is the source of a fatal, safe mode can force a bundled
 * theme. This only applies when HRL_WP_SAFE_MODE is explicitly enabled.
 */
add_filter('template', static function ($template) {
    return (defined('HRL_WP_SAFE_MODE') && HRL_WP_SAFE_MODE) ? 'twentytwentyfour' : $template;
}, 1);

add_filter('stylesheet', static function ($stylesheet) {
    return (defined('HRL_WP_SAFE_MODE') && HRL_WP_SAFE_MODE) ? 'twentytwentyfour' : $stylesheet;
}, 1);

/**
 * Recovery shortcodes for pages flagged in the audit. These prevent empty
 * pages from looking broken while proper page-builder content is rebuilt.
 */
add_shortcode('hrl_contact_form', static function () {
    $action = esc_url(admin_url('admin-post.php'));

    return <<<HTML
<form class="hrl-contact-form" method="post" action="{$action}">
  <input type="hidden" name="action" value="hrl_contact_form">
  <p><label>Imie i nazwisko<br><input required name="name" type="text"></label></p>
  <p><label>Email<br><input required name="email" type="email"></label></p>
  <p><label>Wiadomosc<br><textarea required name="message" rows="6"></textarea></label></p>
  <p><button type="submit">Wyslij wiadomosc</button></p>
</form>
HTML;
});

add_action('admin_post_nopriv_hrl_contact_form', 'hrl_handle_contact_form');
add_action('admin_post_hrl_contact_form', 'hrl_handle_contact_form');

function hrl_handle_contact_form(): void
{
    $name = sanitize_text_field($_POST['name'] ?? '');
    $email = sanitize_email($_POST['email'] ?? '');
    $message = sanitize_textarea_field($_POST['message'] ?? '');

    if ($email && $message) {
        wp_mail(
            get_option('admin_email'),
            'Nowa wiadomosc z HardbanRecords Lab',
            "Od: {$name} <{$email}>\n\n{$message}",
            array('Reply-To: ' . $email)
        );
    }

    wp_safe_redirect(add_query_arg('sent', '1', wp_get_referer() ?: HRL_CANONICAL_HOME));
    exit;
}

add_shortcode('hrl_radio_embed', static function () {
    return '<div class="hrl-radio-embed"><iframe title="HardbanRecords Lab Radio" src="https://radio.hardbanrecordslab.online" loading="lazy" style="width:100%;min-height:420px;border:0;border-radius:16px;background:#0b0f19"></iframe></div>';
});

add_shortcode('hrl_membership_levels', static function () {
    return <<<HTML
<div class="hrl-membership-levels">
  <h2>Membership Levels</h2>
  <ul>
    <li><strong>Free</strong> - start, profil i podstawowy dostep.</li>
    <li><strong>Starter</strong> - 500 kredytow i narzedzia produkcyjne.</li>
    <li><strong>Pro</strong> - 2000 kredytow, AI i zaawansowane moduly.</li>
    <li><strong>Label</strong> - pelny ekosystem dla wytworni i zespolow.</li>
  </ul>
</div>
HTML;
});

add_action('wp_head', static function () {
    echo '<style>
      .hrl-contact-form input,.hrl-contact-form textarea{width:100%;max-width:720px;padding:12px;border:1px solid #d0d7de;border-radius:8px}
      .hrl-contact-form button{padding:12px 18px;border:0;border-radius:8px;background:#111827;color:#fff;font-weight:700;cursor:pointer}
      .hrl-membership-levels{display:grid;gap:12px}
      .hrl-membership-levels ul{display:grid;gap:10px;padding-left:1.25rem}
    </style>';
});

