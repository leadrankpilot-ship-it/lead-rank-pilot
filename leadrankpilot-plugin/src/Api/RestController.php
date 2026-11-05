<?php
/**
 * Custom REST routes under /leadrankpilot/v1.
 *
 * @package LeadRankPilot
 */

declare(strict_types=1);

namespace LeadRankPilot\Plugin\Api;

use LeadRankPilot\Plugin\Auth\RequestAuthenticator;
use LeadRankPilot\Plugin\Publishing\PostPublisher;
use LeadRankPilot\Plugin\Support\Options;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

final class RestController
{
    public const NAMESPACE = 'leadrankpilot/v1';

    /** @var RequestAuthenticator */
    private $auth;

    /** @var PostPublisher */
    private $publisher;

    public function __construct(?RequestAuthenticator $auth = null, ?PostPublisher $publisher = null)
    {
        $this->auth      = $auth ?: new RequestAuthenticator();
        $this->publisher = $publisher ?: new PostPublisher();
    }

    public function register_routes(): void
    {
        register_rest_route(
            self::NAMESPACE,
            '/health',
            array(
                'methods'             => 'GET',
                'callback'            => array($this, 'health'),
                'permission_callback' => '__return_true',
            )
        );

        register_rest_route(
            self::NAMESPACE,
            '/connect',
            array(
                'methods'             => 'POST',
                'callback'            => array($this, 'connect'),
                'permission_callback' => array($this, 'permission_check'),
            )
        );

        register_rest_route(
            self::NAMESPACE,
            '/posts',
            array(
                'methods'             => 'POST',
                'callback'            => array($this, 'upsert_post'),
                'permission_callback' => array($this, 'permission_check'),
                'args'                => array(
                    'title'   => array(
                        'required' => true,
                        'type'     => 'string',
                    ),
                    'content' => array(
                        'required' => true,
                        'type'     => 'string',
                    ),
                    'status'  => array(
                        'required' => false,
                        'type'     => 'string',
                    ),
                    'slug'    => array(
                        'required' => false,
                        'type'     => 'string',
                    ),
                ),
            )
        );
    }

    /**
     * @return true|WP_Error
     */
    public function permission_check(WP_REST_Request $request)
    {
        return $this->auth->authenticate($request);
    }

    public function health(): WP_REST_Response
    {
        $settings = Options::all();
        return new WP_REST_Response(
            array(
                'ok'               => true,
                'plugin'           => 'leadrankpilot',
                'version'          => LRP_PLUGIN_VERSION,
                'wordpress'        => get_bloginfo('version'),
                'site_url'         => home_url('/'),
                'connected'        => '' !== (string) $settings['connected_at'],
                'allow_publish'    => (bool) $settings['allow_publish'],
                'rest_namespace'   => self::NAMESPACE,
            ),
            200
        );
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function connect(WP_REST_Request $request)
    {
        $label = sanitize_text_field((string) $request->get_param('account_label'));
        $dash  = esc_url_raw((string) $request->get_param('dashboard_url'));

        Options::update(
            array(
                'connected_at'  => gmdate('c'),
                'account_label' => $label,
                'dashboard_url' => $dash,
            )
        );

        $settings = Options::all();

        return new WP_REST_Response(
            array(
                'ok'             => true,
                'connected_at'   => $settings['connected_at'],
                'site_url'       => home_url('/'),
                'plugin_version' => LRP_PLUGIN_VERSION,
                // Returned once so LeadRankPilot cloud can store signing material if needed later.
                'signing_hint'   => substr(hash('sha256', (string) $settings['signing_secret']), 0, 12),
            ),
            200
        );
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function upsert_post(WP_REST_Request $request)
    {
        $idempotency = (string) $request->get_header(RequestAuthenticator::HEADER_IDEMPOTENCY);
        if ('' === $idempotency) {
            $idempotency = (string) $request->get_param('idempotency_key');
        }

        $payload = array(
            'title'              => $request->get_param('title'),
            'content'            => $request->get_param('content'),
            'slug'               => $request->get_param('slug'),
            'status'             => $request->get_param('status'),
            'excerpt'            => $request->get_param('excerpt'),
            'remote_post_id'     => $request->get_param('remote_post_id'),
            'categories'         => $request->get_param('categories'),
            'featured_image_url' => $request->get_param('featured_image_url'),
            'meta_description'   => $request->get_param('meta_description'),
            'focus_keyword'      => $request->get_param('focus_keyword'),
        );

        $result = $this->publisher->upsert($payload, $idempotency);
        if (is_wp_error($result)) {
            return $result;
        }

        return new WP_REST_Response($result, 200);
    }
}
