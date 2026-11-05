<?php
/**
 * Plugin options helpers.
 *
 * @package LeadRankPilot
 */

declare(strict_types=1);

namespace LeadRankPilot\Plugin\Support;

final class Options
{
    public const OPTION_KEY = 'lrp_settings';

    /**
     * @return array{
     *   site_token: string,
     *   signing_secret: string,
     *   connected_at: string,
     *   dashboard_url: string,
     *   account_label: string,
     *   default_status: string,
     *   allow_publish: bool,
     *   debug_log: bool
     * }
     */
    public static function all(): array
    {
        $defaults = self::defaults();
        $stored   = get_option(self::OPTION_KEY, array());
        if (!is_array($stored)) {
            $stored = array();
        }

        return array_merge($defaults, $stored);
    }

    /**
     * @param array<string, mixed> $patch
     */
    public static function update(array $patch): void
    {
        $current = self::all();
        $next    = array_merge($current, $patch);
        update_option(self::OPTION_KEY, $next, false);
    }

    public static function ensure_defaults(): void
    {
        $current = get_option(self::OPTION_KEY, null);
        if (null === $current) {
            $defaults                   = self::defaults();
            $defaults['site_token']     = self::generate_token(40);
            $defaults['signing_secret'] = self::generate_token(48);
            update_option(self::OPTION_KEY, $defaults, false);
            return;
        }

        $merged = self::all();
        if (empty($merged['site_token'])) {
            $merged['site_token'] = self::generate_token(40);
        }
        if (empty($merged['signing_secret'])) {
            $merged['signing_secret'] = self::generate_token(48);
        }
        update_option(self::OPTION_KEY, $merged, false);
    }

    /**
     * @return array{
     *   site_token: string,
     *   signing_secret: string,
     *   connected_at: string,
     *   dashboard_url: string,
     *   account_label: string,
     *   default_status: string,
     *   allow_publish: bool,
     *   debug_log: bool
     * }
     */
    public static function defaults(): array
    {
        return array(
            'site_token'     => '',
            'signing_secret' => '',
            'connected_at'   => '',
            'dashboard_url'  => '',
            'account_label'  => '',
            'default_status' => 'draft',
            'allow_publish'  => true,
            'debug_log'      => false,
        );
    }

    public static function generate_token(int $bytes = 32): string
    {
        try {
            return bin2hex(random_bytes($bytes));
        } catch (\Exception $e) {
            return wp_generate_password($bytes * 2, false, false);
        }
    }

    public static function rotate_credentials(): void
    {
        self::update(
            array(
                'site_token'     => self::generate_token(40),
                'signing_secret' => self::generate_token(48),
                'connected_at'   => '',
                'account_label'  => '',
            )
        );
    }
}
