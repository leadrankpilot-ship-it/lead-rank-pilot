<?php
/**
 * Lightweight PSR-4 autoloader used when Composer vendor/ is not present.
 *
 * @package LeadRankPilot
 */

declare(strict_types=1);

namespace LeadRankPilot\Plugin;

final class Autoloader
{
    /** @var string */
    private static $base_dir;

    public static function register(string $base_dir): void
    {
        self::$base_dir = rtrim($base_dir, '/\\') . DIRECTORY_SEPARATOR;
        spl_autoload_register(array(self::class, 'load'));
    }

    public static function load(string $class): void
    {
        $prefix = __NAMESPACE__ . '\\';
        if (strpos($class, $prefix) !== 0) {
            return;
        }

        $relative = substr($class, strlen($prefix));
        $file     = self::$base_dir . str_replace('\\', DIRECTORY_SEPARATOR, $relative) . '.php';

        if (is_readable($file)) {
            require_once $file;
        }
    }
}
