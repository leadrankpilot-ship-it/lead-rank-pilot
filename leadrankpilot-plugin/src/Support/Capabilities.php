<?php
/**
 * Capability helpers.
 *
 * @package LeadRankPilot
 */

declare(strict_types=1);

namespace LeadRankPilot\Plugin\Support;

final class Capabilities
{
    public const MANAGE = 'manage_options';

    public static function current_user_can_manage(): bool
    {
        return current_user_can(self::MANAGE);
    }
}
