<?php
/**
 * Fired when the plugin is uninstalled.
 *
 * @package LeadRankPilot
 */

declare(strict_types=1);

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

delete_option('lrp_settings');
delete_option('lrp_idempotency_map');

if (is_multisite()) {
    $sites = get_sites(array('fields' => 'ids'));
    foreach ($sites as $site_id) {
        switch_to_blog((int) $site_id);
        delete_option('lrp_settings');
        delete_option('lrp_idempotency_map');
        restore_current_blog();
    }
}
