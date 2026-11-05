<?php
/**
 * Create / update WordPress posts from LeadRankPilot payloads.
 *
 * @package LeadRankPilot
 */

declare(strict_types=1);

namespace LeadRankPilot\Plugin\Publishing;

use LeadRankPilot\Plugin\Support\Logger;
use LeadRankPilot\Plugin\Support\Options;
use WP_Error;

final class PostPublisher
{
    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>|WP_Error
     */
    public function upsert(array $payload, string $idempotency_key = '')
    {
        $settings = Options::all();

        $title   = isset($payload['title']) ? sanitize_text_field((string) $payload['title']) : '';
        $content = isset($payload['content']) ? (string) $payload['content'] : '';
        $slug    = isset($payload['slug']) ? sanitize_title((string) $payload['slug']) : '';
        $status  = isset($payload['status']) ? sanitize_key((string) $payload['status']) : (string) $settings['default_status'];
        $excerpt = isset($payload['excerpt']) ? sanitize_textarea_field((string) $payload['excerpt']) : '';
        $remote  = isset($payload['remote_post_id']) ? absint($payload['remote_post_id']) : 0;
        $category_names = isset($payload['categories']) && is_array($payload['categories']) ? $payload['categories'] : array();
        $featured_url = isset($payload['featured_image_url']) ? esc_url_raw((string) $payload['featured_image_url']) : '';
        $meta_description = isset($payload['meta_description']) ? sanitize_text_field((string) $payload['meta_description']) : '';
        $focus_keyword = isset($payload['focus_keyword']) ? sanitize_text_field((string) $payload['focus_keyword']) : '';

        if ('' === $title) {
            return new WP_Error('lrp_missing_title', __('Title is required.', 'leadrankpilot'), array('status' => 400));
        }
        if ('' === $content) {
            return new WP_Error('lrp_missing_content', __('Content is required.', 'leadrankpilot'), array('status' => 400));
        }

        if (!in_array($status, array('draft', 'publish', 'pending', 'future'), true)) {
            return new WP_Error('lrp_bad_status', __('Unsupported post status.', 'leadrankpilot'), array('status' => 400));
        }

        if ('publish' === $status && empty($settings['allow_publish'])) {
            $status = 'draft';
        }

        if ('' !== $idempotency_key) {
            $existing = IdempotencyStore::get($idempotency_key);
            if ($existing && !empty($existing['post_id'])) {
                $post_id = (int) $existing['post_id'];
                if (get_post($post_id)) {
                    Logger::info('Idempotent hit', array('post_id' => $post_id, 'key' => substr($idempotency_key, 0, 12)));
                    return $this->format_result($post_id, true);
                }
            }
        }

        $postarr = array(
            'post_title'   => $title,
            'post_content' => $this->kses_content($content),
            'post_status'  => $status,
            'post_type'    => 'post',
            'post_excerpt' => $excerpt,
        );

        if ('' !== $slug) {
            $postarr['post_name'] = $slug;
        }

        if ($remote > 0 && get_post($remote)) {
            $postarr['ID'] = $remote;
            $post_id       = wp_update_post($postarr, true);
        } else {
            $post_id = wp_insert_post($postarr, true);
        }

        if (is_wp_error($post_id)) {
            Logger::error('Publish failed', array('error' => $post_id->get_error_message()));
            return $post_id;
        }

        $post_id = (int) $post_id;

        $cat_ids = $this->resolve_categories($category_names);
        if (!empty($cat_ids)) {
            wp_set_post_categories($post_id, $cat_ids, false);
        }

        if ('' !== $featured_url) {
            $this->maybe_set_featured_image($post_id, $featured_url);
        }

        if ('' !== $meta_description) {
            update_post_meta($post_id, '_lrp_meta_description', $meta_description);
            // Common SEO plugin keys (best-effort, non-destructive if plugin absent).
            update_post_meta($post_id, '_yoast_wpseo_metadesc', $meta_description);
            update_post_meta($post_id, 'rank_math_description', $meta_description);
        }
        if ('' !== $focus_keyword) {
            update_post_meta($post_id, '_lrp_focus_keyword', $focus_keyword);
            update_post_meta($post_id, '_yoast_wpseo_focuskw', $focus_keyword);
            update_post_meta($post_id, 'rank_math_focus_keyword', $focus_keyword);
        }

        update_post_meta($post_id, '_lrp_managed', '1');
        if ('' !== $idempotency_key) {
            update_post_meta($post_id, '_lrp_idempotency_key', $idempotency_key);
            IdempotencyStore::put(
                $idempotency_key,
                array(
                    'post_id' => $post_id,
                    'status'  => get_post_status($post_id) ?: $status,
                    'link'    => get_permalink($post_id) ?: '',
                )
            );
        }

        Logger::info('Post upserted', array('post_id' => $post_id, 'status' => $status));

        return $this->format_result($post_id, false);
    }

    /**
     * @return array<string, mixed>
     */
    private function format_result(int $post_id, bool $idempotent): array
    {
        $post = get_post($post_id);
        return array(
            'id'         => (string) $post_id,
            'link'       => get_permalink($post_id) ?: '',
            'status'     => $post ? $post->post_status : '',
            'slug'       => $post ? $post->post_name : '',
            'title'      => $post ? $post->post_title : '',
            'idempotent' => $idempotent,
            'mode'       => 'plugin',
        );
    }

    private function kses_content(string $content): string
    {
        // Allow standard post HTML; themes handle presentation.
        return wp_kses_post($content);
    }

    /**
     * @param array<int, mixed> $names
     * @return int[]
     */
    private function resolve_categories(array $names): array
    {
        $ids = array();
        foreach ($names as $name) {
            $label = sanitize_text_field((string) $name);
            if ('' === $label) {
                continue;
            }
            $existing = get_term_by('name', $label, 'category');
            if ($existing && !is_wp_error($existing)) {
                $ids[] = (int) $existing->term_id;
                continue;
            }
            $created = wp_insert_term($label, 'category');
            if (!is_wp_error($created) && isset($created['term_id'])) {
                $ids[] = (int) $created['term_id'];
            }
        }
        return array_values(array_unique($ids));
    }

    private function maybe_set_featured_image(int $post_id, string $url): void
    {
        if (!current_user_can('upload_files') && !defined('LRP_ALLOW_SIDELOAD')) {
            // REST runs without a logged-in user; sideload still works for authenticated plugin requests.
        }

        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';

        $existing = get_post_meta($post_id, '_lrp_featured_source', true);
        if ($existing === $url && has_post_thumbnail($post_id)) {
            return;
        }

        $att_id = media_sideload_image($url, $post_id, null, 'id');
        if (is_wp_error($att_id)) {
            Logger::error('Featured image sideload failed', array('error' => $att_id->get_error_message()));
            return;
        }

        set_post_thumbnail($post_id, (int) $att_id);
        update_post_meta($post_id, '_lrp_featured_source', $url);
    }
}
