<?php
/**
 * wp-admin settings screen.
 *
 * @package LeadRankPilot
 */

declare(strict_types=1);

namespace LeadRankPilot\Plugin\Admin;

use LeadRankPilot\Plugin\Support\Capabilities;
use LeadRankPilot\Plugin\Support\Options;

final class SettingsPage
{
    public function register(): void
    {
        add_action('admin_menu', array($this, 'add_menu'));
        add_action('admin_init', array($this, 'handle_actions'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue'));
    }

    public function add_menu(): void
    {
        add_options_page(
            __('LeadRankPilot', 'leadrankpilot'),
            __('LeadRankPilot', 'leadrankpilot'),
            Capabilities::MANAGE,
            'leadrankpilot',
            array($this, 'render')
        );
    }

    public function enqueue(string $hook): void
    {
        if ('settings_page_leadrankpilot' !== $hook) {
            return;
        }

        wp_enqueue_style(
            'lrp-admin',
            LRP_PLUGIN_URL . 'assets/admin.css',
            array(),
            LRP_PLUGIN_VERSION
        );
        wp_enqueue_script(
            'lrp-admin',
            LRP_PLUGIN_URL . 'assets/admin.js',
            array(),
            LRP_PLUGIN_VERSION,
            true
        );
    }

    public function handle_actions(): void
    {
        if (!Capabilities::current_user_can_manage()) {
            return;
        }

        if (empty($_POST['lrp_action']) || empty($_POST['_wpnonce'])) {
            return;
        }

        $action = sanitize_key(wp_unslash((string) $_POST['lrp_action']));
        if (!wp_verify_nonce(sanitize_text_field(wp_unslash((string) $_POST['_wpnonce'])), 'lrp_settings')) {
            return;
        }

        if ('save' === $action) {
            $allow = !empty($_POST['allow_publish']);
            $debug = !empty($_POST['debug_log']);
            $status = isset($_POST['default_status']) ? sanitize_key(wp_unslash((string) $_POST['default_status'])) : 'draft';
            if (!in_array($status, array('draft', 'publish'), true)) {
                $status = 'draft';
            }

            Options::update(
                array(
                    'allow_publish'  => $allow,
                    'debug_log'      => $debug,
                    'default_status' => $status,
                )
            );

            add_settings_error('lrp', 'lrp_saved', __('Settings saved.', 'leadrankpilot'), 'updated');
            return;
        }

        if ('rotate' === $action) {
            Options::rotate_credentials();
            add_settings_error(
                'lrp',
                'lrp_rotated',
                __('Site token rotated. Reconnect this site in LeadRankPilot.', 'leadrankpilot'),
                'updated'
            );
        }
    }

    public function render(): void
    {
        if (!Capabilities::current_user_can_manage()) {
            wp_die(esc_html__('You do not have permission to manage LeadRankPilot.', 'leadrankpilot'));
        }

        $settings = Options::all();
        $health   = rest_url('leadrankpilot/v1/health');
        $posts    = rest_url('leadrankpilot/v1/posts');
        ?>
        <div class="wrap lrp-admin">
            <h1><?php echo esc_html__('LeadRankPilot', 'leadrankpilot'); ?></h1>
            <p class="lrp-admin__lead">
                <?php echo esc_html__('Connect this WordPress site to LeadRankPilot. Keywords and schedules stay in the LeadRankPilot dashboard; this plugin only publishes content securely.', 'leadrankpilot'); ?>
            </p>

            <?php settings_errors('lrp'); ?>

            <div class="lrp-admin__grid">
                <section class="lrp-card">
                    <h2><?php echo esc_html__('Connection', 'leadrankpilot'); ?></h2>
                    <table class="form-table" role="presentation">
                        <tr>
                            <th scope="row"><?php echo esc_html__('Site token', 'leadrankpilot'); ?></th>
                            <td>
                                <code class="lrp-token" id="lrp-site-token"><?php echo esc_html((string) $settings['site_token']); ?></code>
                                <button type="button" class="button lrp-copy" data-copy-target="lrp-site-token"><?php echo esc_html__('Copy', 'leadrankpilot'); ?></button>
                                <p class="description"><?php echo esc_html__('Paste this token into LeadRankPilot when connecting the site. Treat it like a password.', 'leadrankpilot'); ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><?php echo esc_html__('Signing secret', 'leadrankpilot'); ?></th>
                            <td>
                                <code class="lrp-token" id="lrp-signing-secret"><?php echo esc_html((string) $settings['signing_secret']); ?></code>
                                <button type="button" class="button lrp-copy" data-copy-target="lrp-signing-secret"><?php echo esc_html__('Copy', 'leadrankpilot'); ?></button>
                                <p class="description"><?php echo esc_html__('Used for optional HMAC request signatures (X-LRP-Signature).', 'leadrankpilot'); ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><?php echo esc_html__('Status', 'leadrankpilot'); ?></th>
                            <td>
                                <?php if (!empty($settings['connected_at'])) : ?>
                                    <span class="lrp-pill lrp-pill--ok"><?php echo esc_html__('Connected', 'leadrankpilot'); ?></span>
                                    <span class="description">
                                        <?php
                                        echo esc_html(
                                            sprintf(
                                                /* translators: 1: datetime, 2: account label */
                                                __('since %1$s (%2$s)', 'leadrankpilot'),
                                                (string) $settings['connected_at'],
                                                (string) ($settings['account_label'] ?: 'LeadRankPilot')
                                            )
                                        );
                                        ?>
                                    </span>
                                <?php else : ?>
                                    <span class="lrp-pill lrp-pill--warn"><?php echo esc_html__('Waiting for connection', 'leadrankpilot'); ?></span>
                                <?php endif; ?>
                            </td>
                        </tr>
                    </table>

                    <form method="post">
                        <?php wp_nonce_field('lrp_settings'); ?>
                        <input type="hidden" name="lrp_action" value="rotate" />
                        <?php submit_button(__('Rotate credentials', 'leadrankpilot'), 'delete', 'submit', false); ?>
                    </form>
                </section>

                <section class="lrp-card">
                    <h2><?php echo esc_html__('Publishing defaults', 'leadrankpilot'); ?></h2>
                    <form method="post">
                        <?php wp_nonce_field('lrp_settings'); ?>
                        <input type="hidden" name="lrp_action" value="save" />
                        <table class="form-table" role="presentation">
                            <tr>
                                <th scope="row"><?php echo esc_html__('Allow live publish', 'leadrankpilot'); ?></th>
                                <td>
                                    <label>
                                        <input type="checkbox" name="allow_publish" value="1" <?php checked(!empty($settings['allow_publish'])); ?> />
                                        <?php echo esc_html__('If unchecked, incoming “publish” requests are forced to draft.', 'leadrankpilot'); ?>
                                    </label>
                                </td>
                            </tr>
                            <tr>
                                <th scope="row"><?php echo esc_html__('Default status', 'leadrankpilot'); ?></th>
                                <td>
                                    <select name="default_status">
                                        <option value="draft" <?php selected($settings['default_status'], 'draft'); ?>><?php echo esc_html__('Draft', 'leadrankpilot'); ?></option>
                                        <option value="publish" <?php selected($settings['default_status'], 'publish'); ?>><?php echo esc_html__('Publish', 'leadrankpilot'); ?></option>
                                    </select>
                                </td>
                            </tr>
                            <tr>
                                <th scope="row"><?php echo esc_html__('Debug log', 'leadrankpilot'); ?></th>
                                <td>
                                    <label>
                                        <input type="checkbox" name="debug_log" value="1" <?php checked(!empty($settings['debug_log'])); ?> />
                                        <?php echo esc_html__('Write non-secret debug lines when WP_DEBUG is on.', 'leadrankpilot'); ?>
                                    </label>
                                </td>
                            </tr>
                        </table>
                        <?php submit_button(__('Save settings', 'leadrankpilot')); ?>
                    </form>
                </section>

                <section class="lrp-card lrp-card--wide">
                    <h2><?php echo esc_html__('Endpoints', 'leadrankpilot'); ?></h2>
                    <ul class="lrp-endpoints">
                        <li><strong>GET</strong> <code><?php echo esc_url($health); ?></code></li>
                        <li><strong>POST</strong> <code><?php echo esc_url($posts); ?></code></li>
                    </ul>
                    <p class="description">
                        <?php echo esc_html__('Auth: Authorization Bearer <site_token>. Optional headers: X-LRP-Timestamp, X-LRP-Signature, X-LRP-Idempotency-Key.', 'leadrankpilot'); ?>
                    </p>
                </section>
            </div>
        </div>
        <?php
    }
}
