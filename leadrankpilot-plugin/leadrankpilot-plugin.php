<?php
/**
 * Plugin Name:       LeadRankPilot
 * Plugin URI:        https://leadrankpilot.com
 * Description:       Connects this WordPress site to LeadRankPilot for secure remote blog publishing.
 * Version:           0.1.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            LeadRankPilot
 * Author URI:        https://leadrankpilot.com
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       leadrankpilot
 * Domain Path:       /languages
 *
 * @package LeadRankPilot
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

define('LRP_PLUGIN_VERSION', '0.1.0');
define('LRP_PLUGIN_FILE', __FILE__);
define('LRP_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('LRP_PLUGIN_URL', plugin_dir_url(__FILE__));
define('LRP_PLUGIN_BASENAME', plugin_basename(__FILE__));

$lrp_autoload = LRP_PLUGIN_DIR . 'vendor/autoload.php';
if (is_readable($lrp_autoload)) {
    require_once $lrp_autoload;
} else {
    require_once LRP_PLUGIN_DIR . 'src/Autoloader.php';
    \LeadRankPilot\Plugin\Autoloader::register(LRP_PLUGIN_DIR . 'src');
}

register_activation_hook(__FILE__, array('LeadRankPilot\\Plugin\\Plugin', 'activate'));
register_deactivation_hook(__FILE__, array('LeadRankPilot\\Plugin\\Plugin', 'deactivate'));

add_action(
    'plugins_loaded',
    static function (): void {
        \LeadRankPilot\Plugin\Plugin::instance()->boot();
    }
);
