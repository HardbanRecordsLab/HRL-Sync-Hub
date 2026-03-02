<?php
/**
 * Plugin Name: HRL Sync — Hardban Records Lab
 * Plugin URI:  https://hardbanrecords.com/hrlsync
 * Description: Embed HRL Sync music playlists on WordPress via shortcode or Gutenberg block. Audio served directly from Google Drive.
 * Version:     1.0.0
 * Author:      Hardban Records Lab
 * License:     GPL v2
 * Text Domain: hrl-sync
 */

if (!defined('ABSPATH')) exit;

define('HRL_SYNC_VER', '1.0.0');
define('HRL_SYNC_DIR', plugin_dir_path(__FILE__));
define('HRL_SYNC_URL', plugin_dir_url(__FILE__));

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
    add_shortcode('hrl_sync',         [$this, 'sc_playlist']); // alias
    add_shortcode('hrl_playlist',     [$this, 'sc_playlist']); // alias
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
      <h1 style="font-family:monospace;letter-spacing:2px">🎵 HRL SYNC — Hardban Records Lab</h1>
      <form method="post" action="options.php">
        <?php settings_fields('hrl_sync_settings'); ?>
        <table class="form-table">
          <tr>
            <th>API URL (VPS)</th>
            <td>
              <input type="url" name="hrl_sync_api_url" class="regular-text"
                value="<?php echo esc_attr(get_option('hrl_sync_api_url','https://api.hardbanrecords.com')); ?>">
              <p class="description">Your HRL Sync VPS backend URL</p>
            </td>
          </tr>
          <tr>
            <th>Frontend URL</th>
            <td>
              <input type="url" name="hrl_sync_frontend_url" class="regular-text"
                value="<?php echo esc_attr(get_option('hrl_sync_frontend_url','https://hrlsync.vercel.app')); ?>">
            </td>
          </tr>
          <tr>
            <th>Default Theme</th>
            <td>
              <select name="hrl_sync_default_theme">
                <option value="dark" <?php selected(get_option('hrl_sync_default_theme','dark'),'dark'); ?>>Dark</option>
                <option value="light" <?php selected(get_option('hrl_sync_default_theme','dark'),'light'); ?>>Light</option>
              </select>
            </td>
          </tr>
        </table>
        <?php submit_button('Save Settings'); ?>
      </form>

      <hr>
      <h2>Usage Examples</h2>
      <table class="widefat" style="max-width:700px">
        <tr><th>Basic embed</th><td><code>[hrlsync token="YOUR_TOKEN"]</code></td></tr>
        <tr><th>Light theme</th><td><code>[hrlsync token="abc123" theme="light"]</code></td></tr>
        <tr><th>Custom height + autoplay</th><td><code>[hrlsync token="abc123" height="600" autoplay="true"]</code></td></tr>
        <tr><th>Direct iframe</th><td><code>&lt;iframe src="<?php echo esc_url(get_option('hrl_sync_api_url')); ?>/api/embed-player?token=TOKEN"&gt;&lt;/iframe&gt;</code></td></tr>
      </table>
      <p style="margin-top:12px">Get the <strong>token</strong> from: HRL Sync → Pitches → select playlist → Share Link.</p>

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
  add_option('hrl_sync_api_url',      'https://api.hardbanrecords.com');
  add_option('hrl_sync_frontend_url', 'https://hrlsync.vercel.app');
  add_option('hrl_sync_default_theme','dark');
});
