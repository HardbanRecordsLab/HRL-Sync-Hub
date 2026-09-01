<?php
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HRL SYNC HUB — WORDPRESS PLUGIN ADMIN SCRIPT
 * ═══════════════════════════════════════════════════════════════════════════
 */

if (!defined('ABSPATH')) exit;

if (!class_exists('HRL_Sync_Admin')) {
    class HRL_Sync_Admin {
        public static function init() {
            add_action('admin_menu', [self::class, 'add_menu']);
            add_action('admin_init', [self::class, 'register_settings']);
        }

        public static function add_menu() {
            add_menu_page(
                'HRL Sync Hub',
                'HRL Sync Hub',
                'manage_options',
                'hrl-sync-hub',
                [self::class, 'render_hub_page'],
                'dashicons-admin-site',
                30
            );
        }

        public static function register_settings() {
            register_setting('hrl_sync_hub_settings', 'hrl_sync_hub_url');
        }

        public static function render_hub_page() {
            $hub_url = get_option('hrl_sync_hub_url', 'https://app.hrl-sync-hub.hardbanrecordslab.online');
            ?>
            <div class="wrap" style="margin: 0; padding: 0; height: calc(100vh - 32px); overflow: hidden;">
                <style>
                    #wpbody-content { padding-bottom: 0 !important; }
                    #wpfooter { display: none; }
                    .hrl-hub-container { width: 100%; height: 100%; position: relative; }
                    .hrl-hub-iframe { width: 100%; height: 100%; border: none; }
                </style>
                
                <div class="hrl-hub-container">
                    <iframe 
                        src="<?php echo esc_url($hub_url); ?>" 
                        class="hrl-hub-iframe"
                        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
                    ></iframe>
                </div>
            </div>
            <?php
        }
    }
}
