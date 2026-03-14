<?php
/**
 * Plugin Name: HRL Sync — Hardban Records Lab
 * Plugin URI:  https://hardbanrecordslab.online/hrlsync
 * Description: Embed HRL Sync music playlists and White Label Channels on WordPress. Modernized for v2.0 Premium Pro.
 * Version:     2.0.1
 * Author:      Hardban Records Lab
 * License:     GPL v2
 * Text Domain: hrl-sync
 */

if (!defined('ABSPATH')) exit;

define('HRL_SYNC_VER', '2.0.0');
define('HRL_SYNC_DIR', plugin_dir_path(__FILE__));
define('HRL_SYNC_URL', plugin_dir_url(__FILE__));

if (file_exists(HRL_SYNC_DIR . 'includes/admin-hub.php')) {
    require_once HRL_SYNC_DIR . 'includes/admin-hub.php';
    if (class_exists('HRL_Sync_Admin')) {
        HRL_Sync_Admin::init();
    }
}

// ── Core class ────────────────────────────────────────────────────────────────
class HRL_Sync_Plugin {

  public function __construct() {
    add_action('init',                  [$this, 'shortcodes']);
    add_action('admin_menu',            [$this, 'admin_menu']);
    add_action('admin_init',            [$this, 'register_settings']);
    add_action('wp_enqueue_scripts',    [$this, 'frontend_assets']);
    add_action('enqueue_block_editor_assets', [$this, 'block_editor']);
    add_action('rest_api_init',         [$this, 'rest_routes']);
    add_filter('widget_text',           'do_shortcode');
  }

  // ── Shortcodes ──────────────────────────────────────────────────────────────

  public function shortcodes() {
    add_shortcode('hrlsync',          [$this, 'sc_playlist']);
    add_shortcode('hrl_sync',         [$this, 'sc_playlist']);
    add_shortcode('hrl_playlist',     [$this, 'sc_playlist']);
    add_shortcode('hrl_channel',      [$this, 'sc_channel']);
    add_shortcode('hrl_public_library', [$this, 'sc_public_library']);
  }

  /**
   * [hrl_channel id="CHANNEL_UUID"]
   */
  public function sc_public_library($atts) {
    $frontend_url = get_option('hrl_sync_frontend_url', 'https://app.hrl-sync-hub.hardbanrecordslab.online');
    $public_url = trailingslashit($frontend_url) . 'public-library';
    
    return sprintf(
        '<div class="hrl-sync-embed hrl-public-library">
            <iframe src="%s" style="width:100%%; min-height:600px; border:none;" allow="autoplay; encrypted-media"></iframe>
        </div>',
        esc_url($public_url)
    );
  }

  /**
   * [hrl_channel id="CHANNEL_UUID"]
    $atts = shortcode_atts([
      'id'       => '',
      'theme'    => get_option('hrl_sync_default_theme', 'dark'),
      'height'   => '440',
      'width'    => '100%',
    ], $atts);

    if (empty($atts['id'])) {
      return '<p style="color:#FF3C50;font-family:monospace;font-size:12px">HRL Sync: channel ID missing.</p>';
    }

    $api  = esc_url(get_option('hrl_sync_api_url', 'https://api.hardbanrecords.com'));
    $id   = sanitize_text_field($atts['id']);
    $them = in_array($atts['theme'], ['dark','light']) ? $atts['theme'] : 'dark';
    $h    = intval($atts['height']).'px';
    $uid  = 'hrl-ch-'.substr(md5($id.uniqid()), 0, 8);

    $src = add_query_arg(['theme' => $them], $api.'/api/business/channels/'.$id.'/embed');

    return '<div class="hrl-sync-channel-embed" id="'.$uid.'" style="width:'.esc_attr($atts['width']).'">
      <iframe
        src="'.esc_url($src).'"
        style="width:100%;height:'.$h.';border:none;border-radius:10px;display:block"
        allow="autoplay; clipboard-write"
        scrolling="no"
        loading="lazy"
        title="HRL Sync Channel"
      ></iframe>
    </div>';
  }

  /**
   * [hrlsync token="abc123"]
   * [hrlsync token="abc123" theme="light" height="600" autoplay="true"]
   */
  public function sc_playlist($atts) {
    $atts = shortcode_atts([
      'token'    => '',
      'theme'    => get_option('hrl_sync_default_theme', 'dark'),
      'height'   => 'auto',
      'autoplay' => 'false',
      'width'    => '100%',
    ], $atts);

    if (empty($atts['token'])) {
      return '<p style="color:#FF3C50;font-family:monospace;font-size:12px">HRL Sync: token missing. Usage: [hrlsync token="YOUR_TOKEN"]</p>';
    }

    $api  = esc_url(get_option('hrl_sync_api_url', 'https://api.hardbanrecords.com'));
    $tok  = sanitize_text_field($atts['token']);
    $them = in_array($atts['theme'], ['dark','light']) ? $atts['theme'] : 'dark';
    $auto = $atts['autoplay'] === 'true' ? 'true' : 'false';
    $h    = $atts['height'] === 'auto' ? 'min-height:440px' : 'height:'.intval($atts['height']).'px';
    $uid  = 'hrl-'.substr(md5($tok.uniqid()), 0, 8);

    $src = add_query_arg(['token' => $tok, 'theme' => $them, 'autoplay' => $auto], $api.'/api/embed-player');

    return '<div class="hrl-sync-embed" id="'.$uid.'" style="width:'.esc_attr($atts['width']).'">
      <iframe
        src="'.esc_url($src).'"
        style="width:100%;'.$h.';border:none;border-radius:10px;display:block"
        allow="autoplay; clipboard-write"
        scrolling="no"
        loading="lazy"
        title="HRL Sync Player"
      ></iframe>
    </div>
    <script>
    !function(){window.addEventListener("message",function(e){
      if(e.data&&e.data.type==="syncflow-resize"){
        var el=document.getElementById("'.$uid.'");
        if(el){var f=el.querySelector("iframe");if(f)f.style.height=(e.data.height+16)+"px";}
      }
    });}();
    </script>';
  }

  // ── Admin ───────────────────────────────────────────────────────────────────

  public function admin_menu() {
    add_options_page('HRL Sync','HRL Sync','manage_options','hrl-sync',[$this,'settings_page']);
  }

  public function register_settings() {
    foreach (['hrl_sync_api_url','hrl_sync_frontend_url','hrl_sync_default_theme'] as $k) {
      register_setting('hrl_sync_settings', $k);
    }
  }

  public function settings_page() { ?>
    <div class="wrap">
      <h1 style="font-family:monospace;letter-spacing:2px">🎵 HRL SYNC — Premium Pro v2.0</h1>
      <p style="background:#FF3C50;color:#fff;display:inline-block;padding:2px 8px;font-size:10px;border-radius:2px;font-weight:bold;margin-bottom:20px">BUSINESS & AI EDITION</p>
      <form method="post" action="options.php">
        <?php settings_fields('hrl_sync_settings'); ?>
        <table class="form-table">
          <tr>
            <th>API URL (VPS)</th>
            <td>
              <input type="url" name="hrl_sync_api_url" class="regular-text"
                value="<?php echo esc_attr(get_option('hrl_sync_api_url','https://hrl-sync-hub.hardbanrecordslab.online')); ?>">
              <p class="description">Your HRL Sync VPS backend URL (v2.0 logic enabled)</p>
            </td>
          </tr>
          <tr>
            <th>Frontend URL</th>
            <td>
              <input type="url" name="hrl_sync_frontend_url" class="regular-text"
                value="<?php echo esc_attr(get_option('hrl_sync_frontend_url','https://app.hrl-sync-hub.hardbanrecordslab.online')); ?>">
            </td>
          </tr>
          <tr>
            <th>Default Theme</th>
            <td>
              <select name="hrl_sync_default_theme">
                <option value="dark" <?php selected(get_option('hrl_sync_default_theme','dark'),'dark'); ?>>Dark (Recommended)</option>
                <option value="light" <?php selected(get_option('hrl_sync_default_theme','dark'),'light'); ?>>Light</option>
              </select>
            </td>
          </tr>
        </table>
        <?php submit_button('Save Settings'); ?>
      </form>

      <hr>
      <h2>Shortcodes & Embeds</h2>
      <table class="widefat" style="max-width:700px">
        <tr style="background:#f9f9f9"><th>Playlist Embed</th><td><code>[hrlsync token="YOUR_TOKEN"]</code></td></tr>
        <tr><th>Channel Embed (White Label)</th><td><code>[hrl_channel id="CHANNEL_ID"]</code></td></tr>
        <tr style="background:#f9f9f9"><th>Customization</th><td>Support <code>theme="light"</code> and <code>height="600"</code></td></tr>
        <tr><th>Direct iframe</th><td><code>&lt;iframe src="<?php echo esc_url(get_option('hrl_sync_api_url')); ?>/api/embed-player?token=TOKEN"&gt;&lt;/iframe&gt;</code></td></tr>
      </table>
      <p style="margin-top:12px">Get IDs from your <strong>HRL Sync Hub</strong> (Pitches or Business sections).</p>

      <hr>
      <h2>Test Connection</h2>
      <button onclick="testConn()" class="button button-secondary">Test API Connection</button>
      <span id="hrl-test-result" style="margin-left:12px;font-family:monospace"></span>
      <script>
      function testConn(){
        document.getElementById('hrl-test-result').textContent='Testing…';
        fetch('<?php echo esc_url(get_option('hrl_sync_api_url','https://api.hardbanrecords.com')); ?>/health')
          .then(r=>r.json())
          .then(d=>document.getElementById('hrl-test-result').textContent=d.status==='ok'?'✅ Connected (DB: '+d.db+')':'⚠ '+JSON.stringify(d))
          .catch(e=>document.getElementById('hrl-test-result').textContent='❌ '+e.message);
      }
      </script>
    </div>
  <?php }

  // ── Frontend assets ─────────────────────────────────────────────────────────
  public function frontend_assets() {
    wp_enqueue_style('hrl-sync', HRL_SYNC_URL.'assets/embed.css', [], HRL_SYNC_VER);
  }

  // ── Gutenberg block ─────────────────────────────────────────────────────────
  public function block_editor() {
    wp_enqueue_script('hrl-sync-block', HRL_SYNC_URL.'assets/block.js',
      ['wp-blocks','wp-element','wp-block-editor','wp-components'], HRL_SYNC_VER, true);
    wp_localize_script('hrl-sync-block', 'hrlSyncConfig', [
      'apiUrl'       => get_option('hrl_sync_api_url', 'https://api.hardbanrecords.com'),
      'defaultTheme' => get_option('hrl_sync_default_theme', 'dark'),
    ]);
  }

  // ── REST ────────────────────────────────────────────────────────────────────
  public function rest_routes() {
    register_rest_route('hrl-sync/v1', '/status', [
      'methods'             => 'GET',
      'callback'            => [$this, 'rest_status'],
      'permission_callback' => '__return_true',
    ]);
  }
  public function rest_status($req) {
    $api = get_option('hrl_sync_api_url', '');
    if (!$api) return new WP_Error('no_api', 'API URL not configured', ['status' => 400]);
    $r = wp_remote_get($api.'/health', ['timeout' => 5]);
    if (is_wp_error($r)) return new WP_Error('unreachable', $r->get_error_message(), ['status' => 502]);
    return rest_ensure_response(json_decode(wp_remote_retrieve_body($r), true));
  }
}

new HRL_Sync_Plugin();

register_activation_hook(__FILE__, function() {
  add_option('hrl_sync_api_url',      'https://hrl-sync-hub.hardbanrecordslab.online');
  add_option('hrl_sync_frontend_url', 'https://app.hrl-sync-hub.hardbanrecordslab.online');
  add_option('hrl_sync_default_theme','dark');
});
