<?php
/**
 * PHPUnit bootstrap (unit tests that do not boot full WordPress).
 *
 * @package LeadRankPilot
 */

declare(strict_types=1);

$autoload = dirname(__DIR__) . '/vendor/autoload.php';
if (is_readable($autoload)) {
    require_once $autoload;
} else {
    require_once dirname(__DIR__) . '/src/Autoloader.php';
    \LeadRankPilot\Plugin\Autoloader::register(dirname(__DIR__) . '/src');
}
