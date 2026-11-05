<?php
/**
 * Stores idempotency key → remote post id mappings.
 *
 * @package LeadRankPilot
 */

declare(strict_types=1);

namespace LeadRankPilot\Plugin\Publishing;

final class IdempotencyStore
{
    public const OPTION_KEY = 'lrp_idempotency_map';
    private const TTL_SECONDS = 2592000; // 30 days

    public static function get(string $key): ?array
    {
        $map = self::all();
        if (!isset($map[$key]) || !is_array($map[$key])) {
            return null;
        }

        $entry = $map[$key];
        $created = isset($entry['created_at']) ? (int) $entry['created_at'] : 0;
        if ($created && (time() - $created) > self::TTL_SECONDS) {
            unset($map[$key]);
            update_option(self::OPTION_KEY, $map, false);
            return null;
        }

        return $entry;
    }

    /**
     * @param array{post_id:int,status:string,link?:string} $payload
     */
    public static function put(string $key, array $payload): void
    {
        if ('' === $key) {
            return;
        }

        $map = self::all();
        $map[$key] = array(
            'post_id'    => (int) $payload['post_id'],
            'status'     => (string) $payload['status'],
            'link'       => isset($payload['link']) ? (string) $payload['link'] : '',
            'created_at' => time(),
        );
        update_option(self::OPTION_KEY, $map, false);
    }

    public static function cleanup(): void
    {
        $map = self::all();
        $now = time();
        $changed = false;

        foreach ($map as $key => $entry) {
            $created = is_array($entry) && isset($entry['created_at']) ? (int) $entry['created_at'] : 0;
            if (!$created || ($now - $created) > self::TTL_SECONDS) {
                unset($map[$key]);
                $changed = true;
            }
        }

        if ($changed) {
            update_option(self::OPTION_KEY, $map, false);
        }
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private static function all(): array
    {
        $map = get_option(self::OPTION_KEY, array());
        return is_array($map) ? $map : array();
    }
}
