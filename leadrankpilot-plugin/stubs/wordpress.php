<?php
/**
 * IDE / static-analysis stubs for WordPress core symbols.
 * Not loaded at runtime — WordPress provides the real implementations.
 *
 * @package LeadRankPilot
 */

declare(strict_types=1);

define('ABSPATH', '');
define('HOUR_IN_SECONDS', 3600);
define('WP_DEBUG', false);
define('WP_UNINSTALL_PLUGIN', true);

/**
 * @param string $file
 */
function plugin_dir_path($file): string
{
    return '';
}

/**
 * @param string $file
 */
function plugin_dir_url($file): string
{
    return '';
}

/**
 * @param string $file
 */
function plugin_basename($file): string
{
    return '';
}

/**
 * @param string   $file
 * @param callable $callback
 */
function register_activation_hook($file, $callback): void
{
}

/**
 * @param string   $file
 * @param callable $callback
 */
function register_deactivation_hook($file, $callback): void
{
}

/**
 * @param string   $hook
 * @param callable $callback
 * @param int      $priority
 * @param int      $accepted_args
 */
function add_action($hook, $callback, $priority = 10, $accepted_args = 1): void
{
}

/**
 * @param string $text
 * @param string $domain
 */
function __($text, $domain = 'default'): string
{
    return $text;
}

/**
 * @param string $text
 */
function esc_html($text): string
{
    return (string) $text;
}

/**
 * @param string $text
 * @param string $domain
 */
function esc_html__($text, $domain = 'default'): string
{
    return $text;
}

/**
 * @param string $url
 */
function esc_url($url): string
{
    return (string) $url;
}

/**
 * @param string $url
 */
function esc_url_raw($url): string
{
    return (string) $url;
}

/**
 * @param mixed $value
 */
function wp_unslash($value)
{
    return $value;
}

/**
 * @param string $key
 */
function sanitize_key($key): string
{
    return (string) $key;
}

/**
 * @param string $str
 */
function sanitize_text_field($str): string
{
    return (string) $str;
}

/**
 * @param string $str
 */
function sanitize_textarea_field($str): string
{
    return (string) $str;
}

/**
 * @param string $title
 */
function sanitize_title($title): string
{
    return (string) $title;
}

/**
 * @param string $nonce
 * @param string $action
 */
function wp_verify_nonce($nonce, $action = -1): bool
{
    return true;
}

/**
 * @param string $action
 * @param string $name
 * @param bool   $referer
 * @param bool   $echo
 */
function wp_nonce_field($action = -1, $name = '_wpnonce', $referer = true, $echo = true)
{
    return '';
}

/**
 * @param string $option
 * @param mixed  $default
 */
function get_option($option, $default = false)
{
    return $default;
}

/**
 * @param string $option
 * @param mixed  $value
 * @param bool|null $autoload
 */
function update_option($option, $value, $autoload = null): bool
{
    return true;
}

/**
 * @param string $option
 */
function delete_option($option): bool
{
    return true;
}

/**
 * @param int|string $blog_id
 */
function switch_to_blog($blog_id): bool
{
    return true;
}

function restore_current_blog(): bool
{
    return true;
}

function is_multisite(): bool
{
    return false;
}

/**
 * @param array $args
 * @return array
 */
function get_sites($args = array()): array
{
    return array();
}

function is_admin(): bool
{
    return false;
}

/**
 * @param string $capability
 * @param mixed  ...$args
 */
function current_user_can($capability, ...$args): bool
{
    return true;
}

/**
 * @param string $domain
 * @param string|false $deprecated
 * @param string|false $plugin_rel_path
 */
function load_plugin_textdomain($domain, $deprecated = false, $plugin_rel_path = false): bool
{
    return true;
}

/**
 * @param string $hook
 * @param mixed  ...$args
 * @return false|int
 */
function wp_next_scheduled($hook, $args = array())
{
    return false;
}

/**
 * @param int    $timestamp
 * @param string $recurrence
 * @param string $hook
 * @param array  $args
 */
function wp_schedule_event($timestamp, $recurrence, $hook, $args = array()): bool
{
    return true;
}

/**
 * @param int    $timestamp
 * @param string $hook
 * @param array  $args
 */
function wp_unschedule_event($timestamp, $hook, $args = array()): bool
{
    return true;
}

function flush_rewrite_rules($hard = true): void
{
}

/**
 * @param string $data
 * @param int    $length
 * @param bool   $special_chars
 * @param bool   $extra_special_chars
 */
function wp_generate_password($length = 12, $special_chars = true, $extra_special_chars = false): string
{
    return '';
}

/**
 * @param mixed $data
 * @param int|null $options
 * @param int $depth
 * @return string|false
 */
function wp_json_encode($data, $options = 0, $depth = 512)
{
    return json_encode($data, $options, $depth);
}

/**
 * @param string $path
 * @param string $blog_id
 */
function home_url($path = '', $scheme = null): string
{
    return '';
}

/**
 * @param string $show
 * @param string $filter
 */
function get_bloginfo($show = '', $filter = 'raw'): string
{
    return '';
}

/**
 * @param string $path
 * @param string $scheme
 */
function rest_url($path = '', $scheme = 'rest'): string
{
    return '';
}

/**
 * @param string $namespace
 * @param string $route
 * @param array  $args
 * @param bool   $override
 */
function register_rest_route($namespace, $route, $args = array(), $override = false): bool
{
    return true;
}

/**
 * @param string $page_title
 * @param string $menu_title
 * @param string $capability
 * @param string $menu_slug
 * @param callable|null $callback
 * @param int|null $position
 * @return string|false
 */
function add_options_page($page_title, $menu_title, $capability, $menu_slug, $callback = null, $position = null)
{
    return false;
}

/**
 * @param string $handle
 * @param string $src
 * @param array  $deps
 * @param string|bool|null $ver
 * @param string $media
 */
function wp_enqueue_style($handle, $src = '', $deps = array(), $ver = false, $media = 'all'): void
{
}

/**
 * @param string $handle
 * @param string $src
 * @param array  $deps
 * @param string|bool|null $ver
 * @param bool   $in_footer
 */
function wp_enqueue_script($handle, $src = '', $deps = array(), $ver = false, $in_footer = false): void
{
}

/**
 * @param string $message
 * @param string $title
 * @param array|string $args
 */
function wp_die($message = '', $title = '', $args = array()): void
{
}

/**
 * @param string $setting
 * @param string $code
 * @param string $message
 * @param string $type
 */
function add_settings_error($setting, $code, $message, $type = 'error'): void
{
}

/**
 * @param string|array $filter
 * @param bool         $sanitize
 * @param bool         $hide_on_update
 */
function settings_errors($filter = '', $sanitize = false, $hide_on_update = false): void
{
}

/**
 * @param string $text
 * @param string $type
 * @param string $name
 * @param bool   $wrap
 * @param array  $other_attributes
 */
function submit_button($text = null, $type = 'primary', $name = 'submit', $wrap = true, $other_attributes = null): void
{
}

/**
 * @param mixed  $checked
 * @param mixed  $current
 * @param bool   $display
 */
function checked($checked, $current = true, $display = true)
{
    return '';
}

/**
 * @param mixed  $selected
 * @param mixed  $current
 * @param bool   $display
 */
function selected($selected, $current = true, $display = true)
{
    return '';
}

/**
 * @param string $data
 */
function wp_kses_post($data): string
{
    return (string) $data;
}

/**
 * @param array $postarr
 * @param bool  $wp_error
 * @param bool  $fire_after_hooks
 * @return int|WP_Error
 */
function wp_insert_post($postarr, $wp_error = false, $fire_after_hooks = true)
{
    return 0;
}

/**
 * @param array $postarr
 * @param bool  $wp_error
 * @param bool  $fire_after_hooks
 * @return int|WP_Error
 */
function wp_update_post($postarr = array(), $wp_error = false, $fire_after_hooks = true)
{
    return 0;
}

/**
 * @param int|WP_Post|null $post
 * @param string $output
 * @param string $filter
 * @return WP_Post|array|null
 */
function get_post($post = null, $output = 'OBJECT', $filter = 'raw')
{
    return null;
}

/**
 * @param int|WP_Post $post
 * @param bool $leavename
 * @return string|false
 */
function get_permalink($post = 0, $leavename = false)
{
    return '';
}

/**
 * @param int $post_id
 * @return string|false
 */
function get_post_status($post_id = null)
{
    return false;
}

/**
 * @param int   $post_id
 * @param int[] $post_categories
 * @param bool  $append
 * @return array|false|WP_Error
 */
function wp_set_post_categories($post_id = 0, $post_categories = array(), $append = false)
{
    return array();
}

/**
 * @param string     $field
 * @param string|int $value
 * @param string     $taxonomy
 * @param string     $output
 * @param string     $filter
 * @return WP_Term|array|false
 */
function get_term_by($field, $value, $taxonomy = '', $output = 'OBJECT', $filter = 'raw')
{
    return false;
}

/**
 * @param string|array $term
 * @param string       $taxonomy
 * @param array|string $args
 * @return array|WP_Error
 */
function wp_insert_term($term, $taxonomy = '', $args = array())
{
    return array('term_id' => 0);
}

/**
 * @param int    $post_id
 * @param string $key
 * @param bool   $single
 * @return mixed
 */
function get_post_meta($post_id, $key = '', $single = false)
{
    return '';
}

/**
 * @param int    $post_id
 * @param string $meta_key
 * @param mixed  $meta_value
 * @param mixed  $prev_value
 */
function update_post_meta($post_id, $meta_key, $meta_value, $prev_value = ''): bool
{
    return true;
}

/**
 * @param int|WP_Post $post
 */
function has_post_thumbnail($post = null): bool
{
    return false;
}

/**
 * @param int $post_id
 * @param int $thumbnail_id
 */
function set_post_thumbnail($post, $thumbnail_id): bool
{
    return true;
}

/**
 * @param string $file
 * @param int    $post_id
 * @param string|null $desc
 * @param string $return
 * @return int|string|array|WP_Error
 */
function media_sideload_image($file, $post_id = 0, $desc = null, $return = 'html')
{
    return 0;
}

/**
 * @param int $maybeint
 */
function absint($maybeint): int
{
    return (int) $maybeint;
}

/**
 * @param mixed $thing
 */
function is_wp_error($thing): bool
{
    return $thing instanceof WP_Error;
}

class WP_Error
{
    /** @var string */
    public $code = '';

    /**
     * @param string|int $code
     * @param string     $message
     * @param mixed      $data
     */
    public function __construct($code = '', $message = '', $data = '')
    {
    }

    public function get_error_message($code = ''): string
    {
        return '';
    }
}

class WP_REST_Request
{
    public function get_header($key): string
    {
        return '';
    }

    public function get_param($key)
    {
        return null;
    }

    public function get_method(): string
    {
        return 'GET';
    }

    public function get_route(): string
    {
        return '';
    }

    public function get_body(): string
    {
        return '';
    }
}

class WP_REST_Response
{
    /**
     * @param mixed $data
     * @param int   $status
     * @param array $headers
     */
    public function __construct($data = null, $status = 200, $headers = array())
    {
    }
}

class WP_Post
{
    /** @var string */
    public $post_status = '';

    /** @var string */
    public $post_name = '';

    /** @var string */
    public $post_title = '';
}

class WP_Term
{
    /** @var int */
    public $term_id = 0;
}
