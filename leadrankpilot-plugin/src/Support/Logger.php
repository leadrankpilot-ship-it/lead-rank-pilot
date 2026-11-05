<?php
/**
 * Lightweight logger. Never writes secrets.
 *
 * @package LeadRankPilot
 */

declare(strict_types=1);

namespace LeadRankPilot\Plugin\Support;

final class Logger
{
    public static function info(string $message, array $context = array()): void
    {
        self::write('info', $message, $context);
    }

    public static function error(string $message, array $context = array()): void
    {
        self::write('error', $message, $context);
    }

    /**
     * @param array<string, mixed> $context
     */
    private static function write(string $level, string $message, array $context): void
    {
        $settings = Options::all();
        if (!$settings['debug_log'] && 'error' !== $level) {
            return;
        }

        if (!defined('WP_DEBUG') || !WP_DEBUG) {
            return;
        }

        $safe = self::redact($context);
        $line = sprintf(
            '[LeadRankPilot][%s] %s %s',
            strtoupper($level),
            $message,
            $safe ? wp_json_encode($safe) : ''
        );

        // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
        error_log($line);
    }

    /**
     * @param array<string, mixed> $context
     * @return array<string, mixed>
     */
    private static function redact(array $context): array
    {
        $blocked = array('token', 'secret', 'password', 'authorization', 'signing_secret', 'site_token');
        $out     = array();

        foreach ($context as $key => $value) {
            $lower = strtolower((string) $key);
            foreach ($blocked as $needle) {
                if (false !== strpos($lower, $needle)) {
                    $out[$key] = '[redacted]';
                    continue 2;
                }
            }
            $out[$key] = $value;
        }

        return $out;
    }
}
