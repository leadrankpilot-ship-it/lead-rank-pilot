<?php
/**
 * Plugin bootstrap.
 *
 * @package LeadRankPilot
 */

declare(strict_types=1);

namespace LeadRankPilot\Plugin;

use LeadRankPilot\Plugin\Admin\SettingsPage;
use LeadRankPilot\Plugin\Api\RestController;
use LeadRankPilot\Plugin\Support\Options;

final class Plugin
{
    /** @var self|null */
    private static $instance = null;

    /** @var bool */
    private $booted = false;

    public static function instance(): self
    {
        if (null === self::$instance) {
            self::$instance = new self();
        }

        return self::$instance;
    }

    public static function activate(): void
    {
        Options::ensure_defaults();

        if (!wp_next_scheduled('lrp_cleanup_idempotency')) {
            wp_schedule_event(time() + HOUR_IN_SECONDS, 'daily', 'lrp_cleanup_idempotency');
        }

        flush_rewrite_rules();
    }

    public static function deactivate(): void
    {
        $timestamp = wp_next_scheduled('lrp_cleanup_idempotency');
        if ($timestamp) {
            wp_unschedule_event($timestamp, 'lrp_cleanup_idempotency');
        }

        flush_rewrite_rules();
    }

    public function boot(): void
    {
        if ($this->booted) {
            return;
        }
        $this->booted = true;

        load_plugin_textdomain('leadrankpilot', false, dirname(LRP_PLUGIN_BASENAME) . '/languages');

        add_action('rest_api_init', array(new RestController(), 'register_routes'));
        add_action('lrp_cleanup_idempotency', array('LeadRankPilot\\Plugin\\Publishing\\IdempotencyStore', 'cleanup'));

        if (is_admin()) {
            (new SettingsPage())->register();
        }
    }
}
