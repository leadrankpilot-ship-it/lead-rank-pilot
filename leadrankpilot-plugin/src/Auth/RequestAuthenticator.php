<?php
/**
 * Authenticate inbound LeadRankPilot API requests.
 *
 * Supports:
 * - Authorization: Bearer <site_token>
 * - Optional HMAC: X-LRP-Timestamp + X-LRP-Signature
 *
 * @package LeadRankPilot
 */

declare(strict_types=1);

namespace LeadRankPilot\Plugin\Auth;

use LeadRankPilot\Plugin\Support\Logger;
use LeadRankPilot\Plugin\Support\Options;
use WP_Error;
use WP_REST_Request;

final class RequestAuthenticator
{
    public const HEADER_TIMESTAMP = 'X-LRP-Timestamp';
    public const HEADER_SIGNATURE = 'X-LRP-Signature';
    public const HEADER_IDEMPOTENCY = 'X-LRP-Idempotency-Key';

    /** Max clock skew for signed requests (5 minutes). */
    private const MAX_SKEW_SECONDS = 300;

    /**
     * @return true|WP_Error
     */
    public function authenticate(WP_REST_Request $request)
    {
        $settings = Options::all();
        $token    = (string) $settings['site_token'];

        if ('' === $token) {
            return new WP_Error(
                'lrp_not_configured',
                __('LeadRankPilot is not configured on this site.', 'leadrankpilot'),
                array('status' => 503)
            );
        }

        $provided = $this->extract_bearer_token($request);
        if ('' === $provided || !hash_equals($token, $provided)) {
            Logger::error('Auth failed: invalid site token');
            return new WP_Error(
                'lrp_unauthorized',
                __('Invalid site token.', 'leadrankpilot'),
                array('status' => 401)
            );
        }

        $signature = (string) $request->get_header(self::HEADER_SIGNATURE);
        $timestamp = (string) $request->get_header(self::HEADER_TIMESTAMP);

        // Signature is optional in v0.1 for easier onboarding; required when both headers present
        // or when signing_secret is set and client sends signature.
        if ('' !== $signature || '' !== $timestamp) {
            $verified = $this->verify_hmac($request, $signature, $timestamp, (string) $settings['signing_secret']);
            if (is_wp_error($verified)) {
                return $verified;
            }
        }

        return true;
    }

    private function extract_bearer_token(WP_REST_Request $request): string
    {
        $header = (string) $request->get_header('authorization');
        if (preg_match('/^Bearer\s+(\S+)$/i', $header, $m)) {
            return $m[1];
        }

        // Fallback query param for constrained hosts (discouraged).
        $query_token = $request->get_param('site_token');
        return is_string($query_token) ? $query_token : '';
    }

    /**
     * @return true|WP_Error
     */
    private function verify_hmac(WP_REST_Request $request, string $signature, string $timestamp, string $secret)
    {
        if ('' === $secret) {
            return new WP_Error(
                'lrp_signing_not_configured',
                __('Signing secret is not configured.', 'leadrankpilot'),
                array('status' => 503)
            );
        }

        if ('' === $signature || '' === $timestamp || !ctype_digit($timestamp)) {
            return new WP_Error(
                'lrp_bad_signature',
                __('Missing or invalid signature headers.', 'leadrankpilot'),
                array('status' => 401)
            );
        }

        $ts = (int) $timestamp;
        if (abs(time() - $ts) > self::MAX_SKEW_SECONDS) {
            return new WP_Error(
                'lrp_timestamp_expired',
                __('Request timestamp is outside the allowed window.', 'leadrankpilot'),
                array('status' => 401)
            );
        }

        $method = strtoupper($request->get_method());
        $route  = $request->get_route();
        $body   = $request->get_body();
        $base   = $timestamp . '.' . $method . '.' . $route . '.' . hash('sha256', $body);
        $expect = hash_hmac('sha256', $base, $secret);

        if (!hash_equals($expect, $signature)) {
            Logger::error('Auth failed: bad HMAC');
            return new WP_Error(
                'lrp_bad_signature',
                __('Signature verification failed.', 'leadrankpilot'),
                array('status' => 401)
            );
        }

        return true;
    }
}
