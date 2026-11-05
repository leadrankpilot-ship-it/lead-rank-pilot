<?php
/**
 * @package LeadRankPilot
 */

declare(strict_types=1);

namespace LeadRankPilot\Plugin\Tests\Unit;

use LeadRankPilot\Plugin\Support\Options;
use PHPUnit\Framework\TestCase;

final class AutoloaderTest extends TestCase
{
    public function test_options_defaults_shape(): void
    {
        $defaults = Options::defaults();
        $this->assertArrayHasKey('site_token', $defaults);
        $this->assertArrayHasKey('signing_secret', $defaults);
        $this->assertSame('draft', $defaults['default_status']);
        $this->assertTrue($defaults['allow_publish']);
    }
}
