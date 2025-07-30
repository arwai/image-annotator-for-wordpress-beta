<?php
/**
 * Image_Annotator_for_WordPress Class
 *
 * This class handles the main functionality of the plugin.
 *
 * @package ARWAI_Image_Annotator
 */

class Image_Annotator_for_WordPress {
    public $filter_called;
    private $table_name;
    private $history_table_name;

    // Meta and Option Keys
    const META_POST_DISPLAY_MODE = '_arwai_image_annotator_post_display_mode';
    const OPTION_DEFAULT_NEW_POST_MODE = 'arwai_image_annotator_default_new_post_mode';
    const META_SET_FIRST_AS_FEATURED = '_arwai_image_annotator_set_first_as_featured';
    const OPTION_ACTIVE_POST_TYPES = 'arwai_image_annotator_active_post_types';
    const META_IMAGE_IDS = '_arwai_multi_image_ids';

    // Annotorious Settings Keys
    const OPTION_ANNO_READ_ONLY = 'arwai_anno_read_only';
    const OPTION_ANNO_ALLOW_EMPTY = 'arwai_anno_allow_empty';
    const OPTION_ANNO_DRAW_ON_SINGLE_CLICK = 'arwai_anno_draw_on_single_click';
    const OPTION_ANNO_TAGS_LINK_TAXONOMY = 'arwai_anno_tags_link_taxonomy';


    /**
     * Adds the viewport meta tag to the site's <head> to ensure proper mobile scaling.
     */
    public function add_viewport_meta_tag() {
        echo '<meta name="viewport" content="width=device-width, initial-scale=1" />';
    }



    function __construct() {
        global $wpdb;

        $this->table_name = $wpdb->prefix . 'annotorious_data';
        $this->history_table_name = $wpdb->prefix . 'annotorious_history';

        add_action( 'wp_enqueue_scripts', array( $this, 'load_public_scripts' ) );
        add_action( 'admin_enqueue_scripts', array( $this, 'load_admin_scripts' ) );
        add_action( 'admin_init', array( $this, 'settings_init' ) );
        add_action( 'admin_menu', array( $this, 'add_settings_page' ) );
        add_action( 'add_meta_boxes', array( $this, 'add_plugin_metaboxes' ) );
        add_action( 'save_post', array( $this, 'save_multi_image_uploader_metabox' ), 10, 2 );
        add_filter( 'the_content', array( $this , 'content_filter' ), 20 );
        add_filter( 'pre_option_wp_attachment_pages_enabled', '__return_true' );

        add_shortcode( 'arwai_all_tags_list', array( $this, 'render_all_tags_list_shortcode' ) );
        add_shortcode( 'arwai_post_tags_list', array( $this, 'render_post_tags_list_shortcode' ) );

        // AJAX actions
        add_action( 'wp_ajax_nopriv_arwai_anno_get', array( $this, 'anno_get') );
        add_action( 'wp_ajax_arwai_anno_get', array( $this, 'anno_get' ) );
        add_action( 'wp_ajax_nopriv_arwai_anno_add', array( $this, 'anno_add') );
        add_action( 'wp_ajax_arwai_anno_add', array( $this, 'anno_add' ) );
        add_action( 'wp_ajax_nopriv_arwai_anno_delete', array( $this, 'anno_delete') );
        add_action( 'wp_ajax_arwai_anno_delete', array( $this, 'anno_delete' ) );
        add_action( 'wp_ajax_nopriv_arwai_anno_update', array( $this, 'anno_update') );
        add_action( 'wp_ajax_arwai_anno_update', array( $this, 'anno_update' ) );
        add_action( 'wp_ajax_arwai_get_annotorious_history', array( $this, 'get_annotorious_history' ) );
        add_action( 'wp_ajax_nopriv_arwai_get_annotorious_history', array( $this, 'get_annotorious_history' ) );
        add_action( 'wp_ajax_arwai_add_taxonomy_term', array( $this, 'arwai_add_taxonomy_term' ) );
        add_action( 'wp_ajax_arwai_regenerate_snippets', array( $this, 'ajax_regenerate_snippets' ) );
        add_action( 'wp_ajax_arwai_clean_old_snippets', array( $this, 'ajax_clean_old_snippets' ) );


    }


    /**
     * Adds the admin menu page for the plugin settings.
     */
    public function add_admin_menu() {
        add_menu_page(
            __('ARWAI Image Annotator Settings', 'arwai-image-annotator'),
            'ARWAI Annotator',
            'manage_options',
            'arwai-image-annotator-settings',
            array($this, 'create_admin_page'),
            'dashicons-format-image',
            80
        );
    }


    private function get_active_post_types() {
        $active_types = get_option( self::OPTION_ACTIVE_POST_TYPES, array( 'post', 'page' ) );
        return !empty($active_types) ? $active_types : array( 'post', 'page' );
    }

    public function settings_init() {
        // Main Settings
        register_setting('arwai_image_annotator_options_group', self::OPTION_DEFAULT_NEW_POST_MODE, ['type' => 'string', 'sanitize_callback' => array( $this, 'sanitize_display_mode_option' ), 'default' => 'metabox_viewer']);
        register_setting('arwai_image_annotator_options_group', self::OPTION_ACTIVE_POST_TYPES, ['type' => 'array', 'sanitize_callback' => array( $this, 'sanitize_active_post_types_option' ), 'default' => array( 'post', 'page' )]);

        // Annotorious Settings
        register_setting('arwai_image_annotator_options_group', self::OPTION_ANNO_READ_ONLY, ['type' => 'boolean', 'sanitize_callback' => 'rest_sanitize_boolean', 'default' => false]);
        register_setting('arwai_image_annotator_options_group', self::OPTION_ANNO_ALLOW_EMPTY, ['type' => 'boolean', 'sanitize_callback' => 'rest_sanitize_boolean', 'default' => false]);
        register_setting('arwai_image_annotator_options_group', self::OPTION_ANNO_DRAW_ON_SINGLE_CLICK, ['type' => 'boolean', 'sanitize_callback' => 'rest_sanitize_boolean', 'default' => false]);
        register_setting('arwai_image_annotator_options_group', self::OPTION_ANNO_TAGS_LINK_TAXONOMY, ['type' => 'string', 'sanitize_callback' => 'sanitize_text_field', 'default' => 'none']);

        // Add settings sections
        add_settings_section('arwai_image_annotator_settings_section_main', 'Image Annotator Global Settings', null, 'arwai-image-annotator-settings');
        add_settings_field('arwai_image_annotator_active_post_types_field', 'Activate Plugin for Post Types', array( $this, 'active_post_types_callback' ), 'arwai-image-annotator-settings', 'arwai_image_annotator_settings_section_main');
        add_settings_field('arwai_image_annotator_default_new_post_mode_field', 'Default Viewer Mode for New Posts', array( $this, 'default_new_post_mode_callback' ), 'arwai-image-annotator-settings', 'arwai_image_annotator_settings_section_main');

        add_settings_section('arwai_image_annotator_settings_section_annotorious', 'Annotorious Settings', null, 'arwai-image-annotator-settings');
        add_settings_field('field_anno_options', '', array($this, 'field_anno_options_callback'), 'arwai-image-annotator-settings', 'arwai_image_annotator_settings_section_annotorious');
        add_settings_field('field_anno_taxonomy', '', array($this, 'field_anno_taxonomy_callback'), 'arwai-image-annotator-settings', 'arwai_image_annotator_settings_section_annotorious');
    }

    public function create_admin_page() {
        ?>
        <div class="wrap">
            <h1><?php echo esc_html(get_admin_page_title()); ?></h1>
            
            <form action="options.php" method="post">
                <?php
                settings_fields('arwai_image_annotator_options_group');
                do_settings_sections('arwai-image-annotator-settings');
                submit_button('Save Settings');
                ?>
            </form>
        </div>
        <?php
    }

    // Sanitization Callbacks
    public function sanitize_display_mode_option( $input ) { $valid_options = array( 'metabox_viewer', 'gutenberg_block' ); return in_array( $input, $valid_options, true ) ? $input : 'metabox_viewer'; }
    public function sanitize_active_post_types_option( $input ) { $sanitized_input = array(); if ( is_array( $input ) ) { $all_registered_post_types = get_post_types( array( 'public' => true ), 'names' ); foreach ( $input as $post_type_slug ) { $slug = sanitize_key( $post_type_slug ); if ( in_array( $slug, $all_registered_post_types, true ) && $slug !== 'attachment' ) { $sanitized_input[] = $slug; } } } return !empty($sanitized_input) ? $sanitized_input : array('post', 'page'); }


    // --- Field Callbacks ---

    // --- Image Annotator Global Settings ---

    // Activate Plugin for Post Types
    public function active_post_types_callback() {
        $saved_options = $this->get_active_post_types();
        $post_types = get_post_types( array( 'public' => true ), 'objects' );
        ?>
        <fieldset>
            <?php foreach ( $post_types as $post_type ) : if ( $post_type->name === 'attachment' ) continue; ?>
                <label><input type="checkbox" name="<?php echo esc_attr( self::OPTION_ACTIVE_POST_TYPES ); ?>[]" value="<?php echo esc_attr( $post_type->name ); ?>" <?php checked( in_array( $post_type->name, $saved_options, true ) ); ?> /> <?php echo esc_html( $post_type->labels->name ); ?></label><br />
            <?php endforeach; ?>
        </fieldset>
        <?php
    }

    // Default Viewer Mode for New Posts
    public function default_new_post_mode_callback() {
        $option_value = get_option( self::OPTION_DEFAULT_NEW_POST_MODE, 'metabox_viewer' );
        ?>
        <fieldset>
            <label><input type="radio" name="<?php echo esc_attr( self::OPTION_DEFAULT_NEW_POST_MODE ); ?>" value="metabox_viewer" <?php checked( $option_value, 'metabox_viewer' ); ?> /> Default Viewer (uses images from the Image Collection metabox)</label><br />
            <label><input type="radio" name="<?php echo esc_attr( self::OPTION_DEFAULT_NEW_POST_MODE ); ?>" value="gutenberg_block" <?php checked( $option_value, 'gutenberg_block' ); ?> /> Gutenberg Block (manual placement)</label>
        </fieldset>
        <?php
    }

    // --- Annotorious Fields ---

    // Behavior Options
    public function field_anno_options_callback() {
        ?>
        <div class="arwai-toggle-list">
            <h3 class="arwai-toggle-list-header">Behavior Options</h3>
            <div class="arwai-toggle-list-content">
                <fieldset>
                    <label><input type="checkbox" name="<?php echo esc_attr(self::OPTION_ANNO_READ_ONLY); ?>" value="1" <?php checked(get_option(self::OPTION_ANNO_READ_ONLY, false)); ?> /> Read Only</label>
                    <p class="description">Prevent users from creating, editing, or deleting annotations.</p>
                    <br>
                    <label><input type="checkbox" name="<?php echo esc_attr(self::OPTION_ANNO_ALLOW_EMPTY); ?>" value="1" <?php checked(get_option(self::OPTION_ANNO_ALLOW_EMPTY, false)); ?> /> Allow Empty Annotations</label>
                    <p class="description">Allow users to save annotations that do not contain any text or tags.</p>
                    <br>
                    <label><input type="checkbox" name="<?php echo esc_attr(self::OPTION_ANNO_DRAW_ON_SINGLE_CLICK); ?>" value="1" <?php checked(get_option(self::OPTION_ANNO_DRAW_ON_SINGLE_CLICK, false)); ?> /> Draw on Single Click</label>
                    <p class="description">Allows users to draw rectangles with a single mouse click (instead of drag-and-drop).</p>
                </fieldset>
            </div>
        </div>
        <?php
    }

    // Link Annotorious Tags to WP-Tags
    public function field_anno_taxonomy_callback() {
         ?>
        <div class="arwai-toggle-list">
            <h3 class="arwai-toggle-list-header">Link Annotorious Tags to WordPress Taxonomy***</h3>
            <div class="arwai-toggle-list-content">
                <select name="<?php echo esc_attr(self::OPTION_ANNO_TAGS_LINK_TAXONOMY); ?>" id="<?php echo esc_attr(self::OPTION_ANNO_TAGS_LINK_TAXONOMY); ?>">
                    <option value="none" <?php selected(get_option(self::OPTION_ANNO_TAGS_LINK_TAXONOMY, 'none'), 'none'); ?>>Do not link (freeform tags)</option>
                    <?php
                    $taxonomies = get_taxonomies(['public' => true], 'objects');
                    $current_selection = get_option(self::OPTION_ANNO_TAGS_LINK_TAXONOMY, 'none');
                    foreach ($taxonomies as $taxonomy) {
                        echo '<option value="' . esc_attr($taxonomy->name) . '" ' . selected($current_selection, $taxonomy->name, false) . '>' . esc_html($taxonomy->labels->name) . '</option>';
                    }
                    ?>
                </select>
                <p class="description">This setting syncs the tag vocabulary with a WordPress taxonomy. <br><strong>***Tag linkage is NOT retroactive</strong>.</p>
            </div>
        </div>
        <?php
    }

    public function add_settings_page() {
        add_options_page(
            'Image Annotator Settings',
            'Image Annotator',
            'manage_options',
            'arwai-image-annotator-settings',
            array( $this, 'settings_page_html' )
        );
    }

public function settings_page_html() {
    if ( ! current_user_can( 'manage_options' ) ) return;
    ?>
    <div class="wrap">
        <h1><?php echo esc_html( get_admin_page_title() ); ?></h1>

        <form action="options.php" method="post">
            <?php
            settings_fields( 'arwai_image_annotator_options_group' );
            do_settings_sections( 'arwai-image-annotator-settings' );
            submit_button( 'Save Settings' );
            ?>
        </form>

        <hr> <div class="arwai-admin-section">
            <h2><?php _e( 'Batch Processing', 'arwai-image-annotator' ); ?></h2>
            <p class="description"><?php _e( 'Use these tools to perform actions on existing annotations.', 'arwai-image-annotator' ); ?></p>
            
            <div id="arwai-snippet-regeneration-wrapper" style="padding:15px; background-color:#fff; border:1px solid #ccd0d4; margin-top:15px;">
                <h4><?php _e( 'Regenerate Annotation Snippets', 'arwai-image-annotator' ); ?></h4>
                <p>
                    <?php _e( 'This will attempt to recreate the image snippet for every annotation based on the current full-size images. This is useful if you have updated or compressed your source images, or if the snippet generation logic has changed.', 'arwai-image-annotator' ); ?>
                </p>
                <p>
                    <strong><?php _e( 'Warning:', 'arwai-image-annotator' ); ?></strong>
                    <?php _e( 'This can be a slow, resource-intensive process. Please back up your database before running.', 'arwai-image-annotator' ); ?>
                </p>

                <button id="arwai-regenerate-snippets-btn" class="button button-secondary">
                    <?php _e( 'Regenerate All Snippets', 'arwai-image-annotator' ); ?>
                </button>
                
                <?php wp_nonce_field('arwai_regenerate_snippets_nonce', 'arwai_regenerate_snippets_nonce_field'); ?>

                <div id="arwai-regeneration-status" style="display:none; margin-top: 10px; padding: 10px; border-left: 4px solid #0073aa;"></div>
            </div>
            


            <div id="arwai-snippet-cleanup-wrapper" style="padding:15px; background-color:#fff; border:1px solid #ccd0d4; margin-top:20px;">
            <h4><?php _e( 'Clean Snippets from Annotation Data', 'arwai-image-annotator' ); ?></h4>
            <p>
                <?php _e( 'This tool will remove the old dataURL snippets that were previously stored inside the main `annotation_data` column. Run this <strong>after</strong> you have successfully run the "Regenerate All Snippets" tool to move the data to the new column.', 'arwai-image-annotator' ); ?>
            </p>
            <p>
                <strong style="color: #dc3232;"><?php _e( 'Warning:', 'arwai-image-annotator' ); ?></strong>
                <?php _e( 'This is a destructive action and cannot be undone. Please ensure you have a complete database backup before proceeding.', 'arwai-image-annotator' ); ?>
            </p>

            <button id="arwai-clean-snippets-btn" class="button button-danger">
                <?php _e( 'Clean All Snippets from Data Column', 'arwai-image-annotator' ); ?>
            </button>
            
            <?php wp_nonce_field('arwai_clean_snippets_nonce', 'arwai_clean_snippets_nonce_field'); ?>

            <div id="arwai-cleanup-status" style="display:none; margin-top: 10px; padding: 10px; border-left: 4px solid #0073aa;"></div>
            </div>


        </div>
        <div class="arwai-shortcode-guide">
            <?php // The rest of your existing shortcode guide HTML... ?>
        </div>

    </div>
    <?php
}


/**
 * AJAX handler to permanently remove the 'arwai-snippet' body
 * from the `annotation_data` JSON column for all annotations.
 */
public function ajax_clean_old_snippets() {
    // Security checks
    check_ajax_referer('arwai_clean_snippets_nonce', 'nonce');
    if (!current_user_can('manage_options')) {
        wp_send_json_error(['message' => 'Permission denied.']);
    }

    global $wpdb;
    $table = $this->table_name;
    $results = $wpdb->get_results("SELECT id, annotation_data FROM {$table}");

    if (empty($results)) {
        wp_send_json_success(['message' => 'No annotations found to process.']);
    }

    $updated_count = 0;
    $unchanged_count = 0;

    foreach ($results as $row) {
        $annotation = json_decode($row->annotation_data, true);
        $was_changed = false;

        // Check if data is valid and if 'body' exists
        if (json_last_error() === JSON_ERROR_NONE && !empty($annotation['body']) && is_array($annotation['body'])) {
            
            // Re-index the body array to avoid issues with array_filter
            $original_body = $annotation['body'];
            
            // Filter out any body item with the purpose 'arwai-snippet'
            $cleaned_body = array_values(array_filter($original_body, function($body_item) {
                return !isset($body_item['purpose']) || $body_item['purpose'] !== 'arwai-snippet';
            }));

            // Check if the body was actually modified
            if (count($cleaned_body) < count($original_body)) {
                $annotation['body'] = $cleaned_body;
                $was_changed = true;
            }
        }

        if ($was_changed) {
            // If changes were made, update the database row
            $wpdb->update(
                $table,
                ['annotation_data' => json_encode($annotation)],
                ['id' => $row->id],
                ['%s'],
                ['%d']
            );
            $updated_count++;
        } else {
            $unchanged_count++;
        }
    }

    wp_send_json_success([
        'message' => sprintf(
            'Cleanup complete. Records updated: %d. Records that did not require cleaning: %d.',
            $updated_count,
            $unchanged_count
        )
    ]);
}

/**
 * AJAX handler to regenerate all annotation snippets.
 * This version is more robust and handles potential server limitations.
 */
public function ajax_regenerate_snippets() {
    // Security checks
    check_ajax_referer('arwai_regenerate_snippets_nonce', 'nonce');
    if (!current_user_can('manage_options')) {
        wp_send_json_error(['message' => 'Permission denied.']);
    }

    // --- NEW: Increase server resources for this specific task ---
    // Try to increase memory and execution time. The '@' suppresses errors if it's not allowed.
    @ini_set('memory_limit', '512M');
    @set_time_limit(300); // 5 minutes

    // --- NEW: Check for GD library before starting ---
    if (!extension_loaded('gd') || !function_exists('imagecreatefromjpeg')) {
        wp_send_json_error(['message' => 'Server requirement missing: The GD image processing library is not enabled on your server. Please contact your web host to enable it.']);
        return;
    }

    global $wpdb;
    $results = $wpdb->get_results("SELECT id, annotation_data FROM {$this->table_name}");

    if (empty($results)) {
        wp_send_json_success(['message' => 'No annotations found to process.']);
    }


    $success_count = 0;
    $failure_count = 0;
    $error_messages = [];

    foreach ($results as $row) {
        $update_result = $this->_create_snippet_from_annotation_data($row->annotation_data);

        if (is_wp_error($update_result)) {
            $failure_count++;
            $error_messages[] = "Annotation ID {$row->id}: " . $update_result->get_error_message();
        } else {
            // --- START: MODIFIED LOGIC ---
            // The helper now returns an array with both parts
            $wpdb->update(
                $this->table_name,
                [
                    'annotation_data' => $update_result['json_data'],
                    'annotation_snippet_data_url' => $update_result['snippet_url']
                ],
                ['id' => $row->id], // where
                ['%s', '%s'], // format of data
                ['%d'] // format of where
            );
            $success_count++;
            // --- END: MODIFIED LOGIC ---
        }
    }

    $final_message = sprintf(
        'Processing complete. Successfully updated: %d. Failed: %d.',
        $success_count,
        $failure_count
    );

    // If there were errors, include them in the response
    if (!empty($error_messages)) {
        $final_message .= "\n\nFailed Items:\n" . implode("\n", array_slice($error_messages, 0, 10)); // Show up to 10 errors
    }

    wp_send_json_success(['message' => $final_message]);
}


/**
 * Creates a dataURL snippet from annotation JSON using the GD library.
 * This version returns a WP_Error object on failure for better debugging.
 *
 * @param string $annotation_json The full annotation data as a JSON string.
 * @return string|WP_Error The updated annotation JSON string or a WP_Error on failure.
 */
private function _create_snippet_from_annotation_data($annotation_json) {
    $annotation = json_decode($annotation_json, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        return new WP_Error('invalid_json', 'Could not decode annotation JSON.');
    }

    $selector_str = $annotation['target']['selector']['value'] ?? null;
    $image_url = $annotation['target']['source'] ?? null;

    if (!$selector_str || strpos($selector_str, 'xywh=percent:') !== 0) {
        return new WP_Error('invalid_selector', 'Selector is missing or not a percentage-based rectangle.');
    }

    if (!$image_url) {
        return new WP_Error('missing_source', 'Image source URL is missing.');
    }

    $attachment_id = attachment_url_to_postid($image_url);
    if (!$attachment_id) {
        return new WP_Error('attachment_not_found', 'Could not find image in media library.');
    }

    $image_path = get_attached_file($attachment_id);
    if (!$image_path || !file_exists($image_path)) {
        return new WP_Error('file_not_found', 'Image file does not exist on the server.');
    }

    list($img_w, $img_h, $image_type) = getimagesize($image_path);
    if (!$img_w || !$img_h) {
        return new WP_Error('getimagesize_failed', 'Could not get image dimensions.');
    }

    $coords = explode(',', str_replace('xywh=percent:', '', $selector_str));
    if (count($coords) !== 4) return new WP_Error('invalid_coords', 'Selector coordinates are invalid.');

    // --- MODIFIED --- Explicitly round the float values to the nearest integer.
    $sx = round((floatval($coords[0]) / 100) * $img_w);
    $sy = round((floatval($coords[1]) / 100) * $img_h);
    $sWidth = round((floatval($coords[2]) / 100) * $img_w);
    $sHeight = round((floatval($coords[3]) / 100) * $img_h);

    // --- MODIFIED --- Ensure width and height are at least 1px to prevent errors.
    if ($sWidth < 1 || $sHeight < 1) {
        return new WP_Error('invalid_dimensions', 'Calculated snippet dimensions are zero or negative.');
    }

    $source_image = null;
    switch ($image_type) {
        case IMAGETYPE_JPEG:
            $source_image = @imagecreatefromjpeg($image_path);
            break;
        case IMAGETYPE_PNG:
            $source_image = @imagecreatefrompng($image_path);
            break;
        case IMAGETYPE_GIF:
            $source_image = @imagecreatefromgif($image_path);
            break;
        default:
            return new WP_Error('unsupported_image_type', 'The image format is not supported (only JPEG, PNG, GIF).');
    }

    if (!$source_image) {
        return new WP_Error('imagecreate_failed', 'Failed to create image resource. The file may be corrupt or memory limit was exceeded.');
    }

    // Now, all parameters are guaranteed to be integers.
    $snippet = imagecreatetruecolor($sWidth, $sHeight);
    imagecopyresampled($snippet, $source_image, 0, 0, $sx, $sy, $sWidth, $sHeight, $sWidth, $sHeight);

    ob_start();
    imagepng($snippet);
    $image_data = ob_get_clean();

    imagedestroy($source_image);
    imagedestroy($snippet);

    $data_url = 'data:image/png;base64,' . base64_encode($image_data);

    $snippet_body = ['type' => 'TextualBody', 'purpose' => 'arwai-snippet', 'value' => $data_url];
    $snippet_index = -1;
    foreach ($annotation['body'] as $index => $body_item) {
        if (isset($body_item['purpose']) && $body_item['purpose'] === 'arwai-snippet') {
            $snippet_index = $index;
            break;
        }
    }

    if ($snippet_index > -1) {
        $annotation['body'][$snippet_index] = $snippet_body;
    } else {
        $annotation['body'][] = $snippet_body;
    }

    return [
        'json_data' => json_encode($annotation),
        'snippet_url' => $data_url
    ];}

/**
 * load_public_scripts
 * Enqueues global styles on all relevant pages and viewer-specific assets only when needed.
 */
public function load_public_scripts() {
    // Run this function on single posts OR any archive page.
    if ( ! is_singular( $this->get_active_post_types() ) && ! is_archive() ) {
        return;
    }

    // --- Global Assets ---
    // Enqueue the main stylesheet unconditionally on these pages because plugin output
    // (like the archive image) might be present.
    wp_enqueue_style( 'arwai-public-css', ARWAI_IMAGE_ANNOTATOR_URL . 'assets/css/public/public.css');

    // --- Viewer-Specific Assets ---
    // Now, check if we are on a singular page to load the heavy viewer-specific assets.
    // This prevents loading heavy JS libraries on archive pages where they aren't used.
    if ( is_singular( $this->get_active_post_types() ) ) {
        $post_id = get_the_ID();
        if (!$post_id) return;

        $display_mode = get_post_meta( $post_id, self::META_POST_DISPLAY_MODE, true ) ?: get_option( self::OPTION_DEFAULT_NEW_POST_MODE, 'metabox_viewer' );

        // Only load the viewer assets if the mode is correct and we have images.
        if ( 'metabox_viewer' === $display_mode ) {
            $image_ids = json_decode( get_post_meta( $post_id, self::META_IMAGE_IDS, true ), true );

            if ( !empty( $image_ids ) && is_array( $image_ids ) ) {
                $image_sources = array_reduce( $image_ids, function($carry, $id) {
                    $large_src = wp_get_attachment_image_src( $id, 'large' );
                    $full_src = wp_get_attachment_image_src( $id, 'full' );
                    $thumb_src = wp_get_attachment_image_src( $id, 'thumbnail' );

                    if ($large_src && $full_src) {
                        $carry[] = [
                            'post_id'      => $id,
                            'largeUrl'     => $large_src[0],
                            'fullUrl'      => $full_src[0],
                            'thumbnailUrl' => $thumb_src ? $thumb_src[0] : ''
                        ];
                    }
                    return $carry;
                }, []);

                if (!empty($image_sources)) {
                    // Enqueue viewer styles
                    wp_enqueue_style( 'arwai-annotorious-css', ARWAI_IMAGE_ANNOTATOR_URL . 'assets/css/annotorious/annotorious.min.css');
                    wp_enqueue_style( 'arwai-slick-css', ARWAI_IMAGE_ANNOTATOR_URL . 'assets/css/slick/slick.css' );

                    // Enqueue viewer scripts
                    wp_enqueue_script( 'arwai-openseadragon-js', ARWAI_IMAGE_ANNOTATOR_URL . 'assets/js/openseadragon/openseadragon.min.js', array('jquery'), null, true );
                    wp_enqueue_script( 'arwai-annotorious-js', ARWAI_IMAGE_ANNOTATOR_URL . 'assets/js/annotorious/annotorious.min.js', array('jquery'), null, true );
                    wp_enqueue_script( 'arwai-annotorious-osd-plugin-js', ARWAI_IMAGE_ANNOTATOR_URL . 'assets/js/annotorious/openseadragon-annotorious.min.js', array( 'arwai-openseadragon-js', 'arwai-annotorious-js' ), null, true );
                    wp_enqueue_script( 'arwai-public-js', ARWAI_IMAGE_ANNOTATOR_URL . 'assets/js/public/script.js', array('jquery', 'arwai-annotorious-osd-plugin-js'), null, true);
                    wp_enqueue_script( 'feather-icons-js', 'https://cdn.jsdelivr.net/npm/feather-icons/dist/feather.min.js', array(), null, true);
                    wp_enqueue_script( 'slick-js', ARWAI_IMAGE_ANNOTATOR_URL . 'assets/js/slick/slick.min.js', array('jquery'), null, true );

                    // Get viewer options and localize script data...
                    $linked_taxonomy = get_option(self::OPTION_ANNO_TAGS_LINK_TAXONOMY, 'none');
                    $current_user_data = null;
                    if ( is_user_logged_in() ) {
                        $user = wp_get_current_user();
                        $current_user_data = [
                            'id' => $user->ID,
                            'displayName' => $user->display_name,
                        ];
                    }

                    $anno_options = [
                        'readOnly' => rest_sanitize_boolean(get_option(self::OPTION_ANNO_READ_ONLY, false)),
                        'allowEmpty' => rest_sanitize_boolean(get_option(self::OPTION_ANNO_ALLOW_EMPTY, false)),
                        'drawOnSingleClick' => rest_sanitize_boolean(get_option(self::OPTION_ANNO_DRAW_ON_SINGLE_CLICK, false)),
                        'linkTaxonomy' => $linked_taxonomy,
                        'addTermNonce' => wp_create_nonce( 'arwai_add_term_nonce' ),
                        'tagVocabulary' => [],
                        'currentUser' => $current_user_data,
                        'tagLinks' => [],
                    ];

                     if ($linked_taxonomy !== 'none') {
                        $terms = get_terms(['taxonomy' => $linked_taxonomy, 'hide_empty' => false]);
                        if (!is_wp_error($terms) && !empty($terms)) {
                            $anno_options['tagVocabulary'] = wp_list_pluck($terms, 'name');
                            $tag_link_map = [];
                            foreach ($terms as $term) {
                                $term_link = get_term_link($term, $linked_taxonomy);
                                if (!is_wp_error($term_link)) {
                                    $tag_link_map[$term->name] = esc_url($term_link);
                                }
                            }
                            $anno_options['tagLinks'] = $tag_link_map;
                        }
                    }

                    $viewer_data = [
                        'containerId'   => 'arwai-simple-viewer-container-' . $post_id,
                        'images'        => $image_sources,
                        'ajax_url'      => admin_url( 'admin-ajax.php' ),
                        'anno_options'  => $anno_options
                    ];

                    wp_localize_script( 'arwai-public-js', 'Arwai_Annotator_Data', $viewer_data );
                }
            }
        }
    }
}


    public function load_admin_scripts($hook_suffix) {
        $is_settings_page = $hook_suffix === 'settings_page_arwai-image-annotator-settings';
        $is_post_edit_page = in_array($hook_suffix, array('post.php', 'post-new.php'));

        if ($is_settings_page) {
             wp_enqueue_script('arwai-admin-js', ARWAI_IMAGE_ANNOTATOR_URL . 'assets/js/admin/admin.js', array('jquery', 'wp-color-picker'), null, true);
             wp_enqueue_style('wp-color-picker');
             wp_enqueue_style('arwai-admin-css', ARWAI_IMAGE_ANNOTATOR_URL . 'assets/css/admin/admin.css');
        }

        if ($is_post_edit_page) {
            $screen = get_current_screen();
            if ( $screen && in_array( $screen->post_type, $this->get_active_post_types() ) ) {
                wp_enqueue_script('arwai-admin-js', ARWAI_IMAGE_ANNOTATOR_URL . 'assets/js/admin/admin.js', array('jquery', 'jquery-ui-sortable'), null, true);
                wp_enqueue_media();
            }
        }
    }


    /**
     * content_filter
     * Generates the HTML for the simple viewer, sidebar, AND the hidden OSD modal.
     */
     public function content_filter($content) {

        if ( !is_singular() ) {
            return $content;
        }

        if ( !is_singular( $this->get_active_post_types() ) || !in_the_loop() || !is_main_query() || $this->filter_called > 0 ) return $content;
        $post_id = get_the_ID();
        if (!$post_id) return $content;

        $display_mode = get_post_meta( $post_id, self::META_POST_DISPLAY_MODE, true ) ?: get_option( self::OPTION_DEFAULT_NEW_POST_MODE, 'metabox_viewer' );

        if ( 'metabox_viewer' === $display_mode ) {
            $image_ids = json_decode( get_post_meta( $post_id, self::META_IMAGE_IDS, true ), true );
            if ( !empty($image_ids) ) {
                $this->filter_called++;
                $container_id = 'arwai-simple-viewer-container-' . $post_id;
                
            // Generate all slides for Slick.
            // The <img> 'src' will be the 'medium' size for mobile-first loading.
            // The 'large' image URL is stored in 'data-large-src' for JS to use on desktop.
            $slides_html = '';
            foreach ($image_ids as $id) {
                $medium_image_html = wp_get_attachment_image( $id, 'medium_large', false, array(
                    'data-large-src'   => wp_get_attachment_image_url($id, 'large'),
                    'data-full-url'    => wp_get_attachment_image_url($id, 'full'),
                    'data-attachment-id' => $id,
                    'loading'          => 'lazy'
                ));
                $slides_html .= "<div><div class='arwai-slick-slide-wrapper'>" . $medium_image_html . "</div></div>";
            }

                $thumbnails_html = '';
                foreach ($image_ids as $index => $id) {
                    $thumb_url = wp_get_attachment_image_url($id, 'thumbnail');
                    $thumbnails_html .= "<img src='" . esc_url($thumb_url) . "' class='arwai-simple-thumb' data-index='" . esc_attr($index) . "'>";
                }
                $viewer_html = "
                <div class='arwai-simple-viewer'>
                    <div id='" . esc_attr($container_id) . "' class='arwai-simple-viewer-container'>

                        <div class='arwai-simple-viewer-container2'>

                            <div class='arwai-simple-viewer-container3'>

                                <div id='arwai-simple-viewer-main'>

                                <div id='arwai-single-annotation-container'>
                                    <ul id='arwai-single-annotation'></ul>
                                </div>
                                                                
                                    <div class='arwai-slick-slider'>
                                        " . $slides_html . "
                                    </div>
                                    
                                    <div class='arwai-simple-viewer-nav'>
                                        <button class='arwai-simple-prev'><span data-feather='arrow-left'></span></button>
                                        <span class='arwai-simple-counter'><span class='arwai-simple-current-index'>1</span> / " . count($image_ids) . "</span>
                                        <button class='arwai-simple-next'><span data-feather='arrow-right'></span></button>
                                    </div>

                                </div>

                                <div class='arwai-simple-viewer-strip-container'>
                                    <button class='arwai-simple-strip-scroll-left'><span data-feather='chevron-left'></span></button>
                                        <div id='arwai-simple-viewer-reference-strip'>
                                            " . $thumbnails_html . "
                                        </div>
                                    <button class='arwai-simple-strip-scroll-right'><span data-feather='chevron-right'></span></button>
                                </div>

                            </div>

                            <div id='arwai-simple-viewer-sidebar'>

                                <div class='arwai-simple-viewer-buttons'>
                                    <div class='arwai-simple-viewer-button-wrapper'>
                                        <button id='arwai-toggle-annotations' class='arwai-simple-toggle' title='Toggle Annotations'>
                                            <span data-feather='eye'></span>
                                            <span data-feather='eye-off' style='display:none;'></span>
                                        </button>   
                                            <span class='feather-eye'>Notes</span>
                                            <span class='feather-eye-off' style='display:none;'>Hide</span>
                                    </div>

                                        
                                    <div class='arwai-simple-viewer-button-wrapper'>
                                        <button id='arwai-launch-osd' class='arwai-deep-zoom-button arwai-simple-toggle' title='Deep Zoom'>
                                            <span data-feather='maximize-2'></span>
                                        </button>
                                        <span>Enlarge</span>
                                    </div>
                                    
                            <div class='arwai-simple-viewer-button-wrapper'>
                                <button id='arwai-information' class='arwai-simple-toggle' title='information'>
                                    <span data-feather='info'></span>
                                </button>
                                <span>Info</span>

                                <div id='info-popup' class='popup-container' style='display: none;'>
                                    <div class='popup-content'>
                                        <div>To add, edit or delete annotations, click on enlarge <span data-feather='maximize-2'></span> to open the Openseadragon viewer. <em>Click</em> or <em>tap</em> the annotation to edit. Hold the SHIFT key while clicking and dragging the mouse to create a new annotation.</div>
                                        <div class='button-wrapper'>
                                            <button id='close-info-popup' title='Close info Popup'> <span data-feather='x-circle'></span></button>
                                        </div>       
                                    </div>
                                </div>

                            </div>
                                    
<div class='arwai-simple-viewer-button-wrapper' style='display:none'>
    <button id='arwai-history' class='arwai-simple-toggle' title='history'>
        <span data-feather='triangle'></span>
    </button>
    <span>History</span>

    <div id='info-popup-2' class='popup-container' style='display: none;'>
        <div class='popup-content'>
            <div>Coming soon...</div>
            <div class='button-wrapper'>
                <button id='close-info-popup-2' title='Close History Popup'> <span data-feather='x-circle'></span></button>
            </div>       
        </div>
    </div>

</div>


                                </div>
                                
                            </div>

                        </div>

                        <div id='arwai-osd-modal' style='display:none;'>
                            <div id='arwai-osd-viewer'>
                            </div>
                            <div id='arwai-openseadragon-toolbar' class='arwai-osd-toolbar-container'>

                                <div class='arwai-osd-toolbar-button-wrapper'>
                                    <button id='arwai-toggle-annotations-osd' title='Toggle Annotations'>
                                        <span data-feather='eye'></span>
                                        <span data-feather='eye-off' style='display:none;'></span>
                                    </button>
                                    <div id='arwaiAnnotationStateOn'>Notes</div>
                                </div>

                                    <div class='arwai-osd-toolbar-button-wrapper' >
                                        <button id='arwaiPrevious'><span data-feather='arrow-left'></span></button>
                                        <span>Previous</span>
                                    </div>

                                    <div id='arwaiHomeWrapper' class='arwai-osd-toolbar-button-wrapper'><button id='arwaiHome'><span data-feather='home'></span></button>
                                        <span>Home</span>
                                    </div>

                                    <div class='arwai-osd-toolbar-button-wrapper'><button id='arwaiNext'><span data-feather='arrow-right'></span></button>
                                        <span>Next</span>
                                    </div>
                                <div class='arwai-osd-toolbar-button-wrapper'>
                                    <button id='arwai-osd-close' title='Close Deep Zoom'> <span data-feather='x-circle'></span></button>
                                    <span>Close</span>

                                </div>

                            </div>

                            <div id='arwai-openseadragon-toolbar-other' class='arwai-osd-toolbar-container'>
                                <div class='arwai-osd-toolbar-button-wrapper' >
                                    <div class='arwai-zoom-buttons'>
                                        <button id='arwaiZoomIn'><span data-feather='zoom-in'></span></button>
                                        <button id='arwaiZoomOut'><span data-feather='zoom-out'></span></button> 
                                    </div>
                                    <span>Zoom</span>
                                </div>
                                <div class='arwai-osd-toolbar-button-wrapper' >
                                    <div class='arwai-rotate-buttons'>
                                        <button id='arwaiRotateLeft'><span data-feather='rotate-ccw'></span></button>
                                        <button id='arwaiRotateRight'><span data-feather='rotate-cw'></span></button> 
                                    </div>
                                    <span>Rotate</span>
                                </div>

                            </div>

                        </div>

                    </div>
                </div>
                    ";
                return $viewer_html . $content;
            }
        }
        return $content;
    }


/**
     * Renders a list of all unique tags from all annotations on the CURRENT POST'S IMAGE
     *
     * @return string The HTML for the tags list.
     */
    public function render_all_tags_list_shortcode() {
        // Only run on single posts/pages where image IDs can be found.
        if ( !is_singular() ) {
            return '';
        }

        $post_id = get_the_ID();
        $image_ids_json = get_post_meta( $post_id, self::META_IMAGE_IDS, true );
        $image_ids = json_decode( $image_ids_json, true );

        // If there are no images in the collection, there's nothing to do.
        if ( empty($image_ids) || !is_array($image_ids) ) {
            return '';
        }

        // ---  Get the ID of the first image in the collection ---
        // We will append this ID to the tag links.
        $first_image_id = $image_ids[0];

        global $wpdb;
        $all_tags = [];
        

        // Prepare a SQL query to get all annotations for the images in the collection.
        $placeholders = implode( ',', array_fill( 0, count($image_ids), '%d' ) );
        $sql = $wpdb->prepare(
            "SELECT annotation_data FROM {$this->table_name} WHERE attachment_id IN ($placeholders)",
            $image_ids
        );

        $results = $wpdb->get_col( $sql );

        // Loop through each annotation's JSON data.
        foreach ( $results as $annotation_json ) {
            $annotation = json_decode( $annotation_json, true );

            // Check for a valid body and loop through its items.
            if ( json_last_error() === JSON_ERROR_NONE && !empty($annotation['body']) ) {
                foreach ( $annotation['body'] as $body_item ) {
                    // If the purpose is 'tagging', extract its value.
                    if ( isset($body_item['purpose']) && $body_item['purpose'] === 'tagging' && !empty($body_item['value']) ) {
                        $all_tags[] = $body_item['value'];
                    }
                }
            }
        }

        // If no tags were found, return empty.
        if ( empty($all_tags) ) {
            return '';
        }

        // Filter for unique tags and sort them alphabetically.
        $unique_tags = array_unique( $all_tags );
        sort( $unique_tags );


        // Check if tags should be linked to taxonomy archives.
        $linked_taxonomy = get_option(self::OPTION_ANNO_TAGS_LINK_TAXONOMY, 'none');

        // Build the final HTML list.
        $html = '<div class="arwai-all-tags-list-shortcode"><h3>Annotation Tags</h3><ul class="arwai-tags-list">';

        foreach ( $unique_tags as $tag_name ) {
            $tag_html = esc_html($tag_name);

            // If a linked taxonomy is set, attempt to create a link.
            if ( $linked_taxonomy !== 'none' ) {
                $term_link = get_term_link( $tag_name, $linked_taxonomy );
                if ( !is_wp_error( $term_link ) ) {
                    $tag_html = '<a href="' . esc_url( $term_link ) . '">' . $tag_html . '</a>';
                }
            }
            $html .= '<li class="arwai-tag">' . $tag_html . '</li>';
        }

        $html .= '</ul></div>';

        return $html;
    }

/**
     * Renders a list of the CURRENT POST's tags in a custom format.
     *
     * @return string The HTML for the post tags list.
     */
    public function render_post_tags_list_shortcode() {
        // Only run on single posts/pages.
        if ( !is_singular() ) {
            return '';
        }

        // Get all tag objects assigned to the current post.
        $post_tags = get_the_tags();

        // If the post has no tags, return an empty string.
        if ( empty($post_tags) ) {
            return '';
        }

        // Build the final HTML list, using the same classes for consistent styling.
        $html = '<div class="arwai-all-tags-list-shortcode"><h3>Post Tags</h3><ul class="arwai-tags-list">';

        // Loop through each tag object.
        foreach ( $post_tags as $tag ) {
            $tag_name = esc_html( $tag->name );
            $tag_link = esc_url( get_term_link( $tag ) );

            // Create the list item with a link.
            $html .= '<li class="arwai-tag"><a href="' . $tag_link . '">' . $tag_name . '</a></li>';
        }

        $html .= '</ul></div>';

        return $html;
    }



    /// METABOXES
    public function add_plugin_metaboxes() {
        $active_post_types = $this->get_active_post_types();
        if (empty($active_post_types)) return;

        add_meta_box('arwai-image-annotator-display-mode-metabox', __('Viewer Mode', 'arwai-image-annotator'), array( $this, 'render_display_mode_metabox' ), $active_post_types, 'side');
        add_meta_box('arwai-multi-image-uploader-metabox', __('Image Collection (sortable)', 'arwai-image-annotator'), array( $this, 'render_multi_image_uploader_metabox' ), $active_post_types, 'normal', 'high');
    }

    public function render_display_mode_metabox($post) {
        $current_display_mode = get_post_meta( $post->ID, self::META_POST_DISPLAY_MODE, true ) ?: get_option( self::OPTION_DEFAULT_NEW_POST_MODE, 'metabox_viewer' );
        ?>
        <div id="arwai-image-annotator-options-container">
            <p><label><input type="radio" name="<?php echo esc_attr( self::META_POST_DISPLAY_MODE ); ?>" value="metabox_viewer" <?php checked( $current_display_mode, 'metabox_viewer' ); ?> /> <?php _e( 'Default Viewer', 'arwai-image-annotator' ); ?></label><br /><small class="description"><?php _e( 'Uses images from the "Image Collection" metabox.', 'arwai-image-annotator' ); ?></small></p>
            <p><label><input type="radio" name="<?php echo esc_attr( self::META_POST_DISPLAY_MODE ); ?>" value="gutenberg_block" <?php checked( $current_display_mode, 'gutenberg_block' ); ?> /> <?php _e( 'Gutenberg Block', 'arwai-image-annotator' ); ?></label><br/><small class="description"><?php _e( 'Manual placement via block editor.', 'arwai-image-annotator' ); ?></small></p>
        </div>
        <?php
    }

    public function render_multi_image_uploader_metabox( $post ) {
        wp_nonce_field( 'arwai_multi_image_uploader_save', 'arwai_multi_image_uploader_nonce' );
        $image_ids_json = get_post_meta( $post->ID, self::META_IMAGE_IDS, true );
        $image_ids = json_decode( $image_ids_json, true );
        if ( ! is_array( $image_ids ) ) { $image_ids = array(); }
        ?>
        <div id="arwai-multi-image-uploader-container">
            <p class="description"><?php _e( 'Select images. Drag to reorder.', 'arwai-image-annotator' ); ?></p>
            <ul class="arwai-multi-image-list">
                <?php if ( ! empty( $image_ids ) ) { foreach ( $image_ids as $id ) { $thumb_url = wp_get_attachment_image_url( $id, 'thumbnail' ); if ( $thumb_url ) { echo '<li data-id="' . esc_attr( $id ) . '"><img src="' . esc_url( $thumb_url ) . '" style="max-width:100px; max-height:100px; display:block;" /><a href="#" class="arwai-multi-image-remove dashicons dashicons-trash" title="Remove image"></a></li>'; } } } ?>
            </ul>
            <p>
                <a href="#" class="button button-secondary arwai-multi-image-add-button"><?php _e( 'Add/Select Images', 'arwai-image-annotator' ); ?></a>
                <input type="hidden" id="arwai_multi_image_ids_field" name="<?php echo esc_attr(self::META_IMAGE_IDS); ?>" value="<?php echo esc_attr( $image_ids_json ); ?>" />
            </p>
            <p><label><input type="checkbox" name="<?php echo esc_attr( self::META_SET_FIRST_AS_FEATURED ); ?>" value="yes" <?php checked( get_post_meta( $post->ID, self::META_SET_FIRST_AS_FEATURED, true ), 'yes' ); ?> /> <?php _e( 'Use the first image in this collection as the post\'s featured image.', 'arwai-image-annotator' ); ?></label></p>
        </div>
        <style>#arwai-multi-image-uploader-container .arwai-multi-image-list li { cursor: move; position: relative; width: 100px; height: 100px; margin: 5px; border: 1px solid #ccc; display: flex; align-items: center; justify-content: center; overflow: hidden; } #arwai-multi-image-uploader-container .arwai-multi-image-list { display: flex; flex-wrap: wrap; list-style: none; margin: 0; padding: 0; } #arwai-multi-image-uploader-container .arwai-multi-image-list li img { max-width: 100%; max-height: 100%; object-fit: contain; } #arwai-multi-image-uploader-container .arwai-multi-image-remove { position: absolute; top: 0; right: 0; background: rgba(255,0,0,0.7); color: white; padding: 3px; cursor: pointer; line-height: 1; text-decoration: none; } .arwai-multi-image-placeholder { background-color: #f0f0f0; border: 1px dashed #ccc; height: 100px; width: 100px; margin: 5px; list-style-type: none; }</style>
        <?php
    }

    public function save_multi_image_uploader_metabox( $post_id, $post ) {
        if ( ! isset( $_POST['arwai_multi_image_uploader_nonce'] ) || ! wp_verify_nonce( $_POST['arwai_multi_image_uploader_nonce'], 'arwai_multi_image_uploader_save' ) ) { return; }
        if ( defined('DOING_AUTOSAVE') && DOING_AUTOSAVE ) return;
        if ( ! current_user_can( 'edit_post', $post_id ) ) return;
        if ( ! in_array($post->post_type, $this->get_active_post_types()) ) return;

        // Save Display Mode
        if ( isset( $_POST[self::META_POST_DISPLAY_MODE] ) ) {
            update_post_meta($post_id, self::META_POST_DISPLAY_MODE, sanitize_text_field($_POST[self::META_POST_DISPLAY_MODE]));
        }

        // Save Image IDs
        if ( isset( $_POST[self::META_IMAGE_IDS] ) ) {
            $ids_json = wp_unslash($_POST[self::META_IMAGE_IDS]);
            $ids = json_decode($ids_json, true);
            if (is_array($ids)) {
                update_post_meta($post_id, self::META_IMAGE_IDS, json_encode(array_values(array_map('intval', $ids))));
            } else {
                delete_post_meta($post_id, self::META_IMAGE_IDS);
            }
        } else {
            delete_post_meta($post_id, self::META_IMAGE_IDS);
        }

        // Save "Set first image in collection as the post's Featured Image"
        $set_featured = isset($_POST[self::META_SET_FIRST_AS_FEATURED]) ? 'yes' : 'no';
        update_post_meta($post_id, self::META_SET_FIRST_AS_FEATURED, $set_featured);
        if ('yes' === $set_featured) {
            $ids = json_decode(get_post_meta($post_id, self::META_IMAGE_IDS, true), true);
            if (!empty($ids) && intval($ids[0]) > 0) {
                set_post_thumbnail($post_id, intval($ids[0]));
            }
        }
    }


    
    /**
     * Syncs tags from an annotation to the image attachment post.
     * This allows the image to appear on WordPress tag/category archive pages.
     *
     * @param int   $attachment_id   The ID of the image attachment.
     * @param array $annotation_body The body array from the annotation.
     */
    private function _sync_annotation_tags_to_attachment($attachment_id, $annotation_body) {
        if ( empty($attachment_id) || empty($annotation_body) || !is_array($annotation_body) ) {
            return;
        }

        // Get the taxonomy that is linked in the settings (e.g., 'post_tag')
        $linked_taxonomy = get_option(self::OPTION_ANNO_TAGS_LINK_TAXONOMY, 'none');

        // Do nothing if no taxonomy is linked or if it doesn't exist
        if ( 'none' === $linked_taxonomy || !taxonomy_exists($linked_taxonomy) ) {
            return;
        }

        // Extract the value from all tagging bodies
        $tags = [];
        foreach ($annotation_body as $body_item) {
            if (isset($body_item['purpose']) && $body_item['purpose'] === 'tagging' && !empty($body_item['value'])) {
                $tags[] = $body_item['value'];
            }
        }

        if ( !empty($tags) ) {
            // Assign the tags to the image (attachment post).
            // The `true` at the end appends the terms, which is safer than overwriting
            // existing terms on the image that might come from other annotations or manual edits.
            wp_set_object_terms($attachment_id, $tags, $linked_taxonomy, true);
        }
    }

    // --- AJAX Functions ---

    function arwai_add_taxonomy_term() {
        if ( ! is_user_logged_in() ) {
            wp_send_json_error( 'You must be logged in to add new tags.' );
        }
        check_ajax_referer( 'arwai_add_term_nonce', 'nonce' );

        $taxonomy = isset($_POST['taxonomy']) ? sanitize_text_field($_POST['taxonomy']) : '';
        $term = isset($_POST['term']) ? sanitize_text_field($_POST['term']) : '';

        if ( empty($taxonomy) || empty($term) ) {
            wp_send_json_error('Missing taxonomy or term.');
        }

        if ( ! taxonomy_exists($taxonomy) ) {
            wp_send_json_error('Taxonomy does not exist.');
        }

        $tax_object = get_taxonomy($taxonomy);
        if ( ! current_user_can($tax_object->cap->manage_terms) ) {
            wp_send_json_error('User does not have permission to add terms.');
        }

        if ( term_exists( $term, $taxonomy ) ) {
            wp_send_json_success('Term already exists.');
        }

        $result = wp_insert_term( $term, $taxonomy );

        if ( is_wp_error($result) ) {
            wp_send_json_error($result->get_error_message());
        } else {
            wp_send_json_success(['term_id' => $result['term_id']]);
        }
    }

    function anno_get() {
        global $wpdb;
        $attachment_id = isset($_GET['attachment_id']) ? intval($_GET['attachment_id']) : 0;
        if (empty($attachment_id)) { wp_send_json_error('Missing attachment_id.'); }
        
        header('Content-Type: application/json');
        $all_annotations = [];

        // --- MODIFIED: Select the new snippet column as well ---
        $results = $wpdb->get_results( $wpdb->prepare( "SELECT annotation_data, annotation_snippet_data_url FROM {$this->table_name} WHERE attachment_id = %d", $attachment_id ), ARRAY_A );
        
        if ( ! empty( $results ) ) {
            foreach ( $results as $row ) {
                $decoded_annotation = json_decode( $row['annotation_data'], true );
                
                if ( json_last_error() === JSON_ERROR_NONE ) {
                    // --- MODIFIED: Add the snippet back into the body for the frontend ---
                    if (!empty($row['annotation_snippet_data_url'])) {
                        if (!isset($decoded_annotation['body'])) {
                            $decoded_annotation['body'] = [];
                        }
                        $decoded_annotation['body'][] = [
                            'type' => 'TextualBody',
                            'purpose' => 'arwai-snippet',
                            'value' => $row['annotation_snippet_data_url']
                        ];
                    }
                    $all_annotations[] = $decoded_annotation;
                }
            }
        }
        echo wp_json_encode($all_annotations);
        wp_die();
    }


// In class Image_Annotator_for_WordPress...

function anno_add() {
    if ( ! is_user_logged_in() ) {
        wp_send_json_error( 'You must be logged in to create annotations.' );
    }

    global $wpdb;
    $annotation_json = isset($_POST['annotation']) ? wp_unslash($_POST['annotation']) : '';
    if (empty($annotation_json)) { wp_send_json_error('Annotation data missing.'); }

    $annotation = json_decode($annotation_json, true);
    if (json_last_error() !== JSON_ERROR_NONE) { wp_send_json_error('Invalid JSON data.'); }



    // $image_url = $annotation['target']['source'] ?? '';
    // if (empty($image_url)) { wp_send_json_error('Annotation target source URL missing.'); }

    // $attachment_id = attachment_url_to_postid($image_url);
    // if (empty($attachment_id)) { wp_send_json_error('Could not find attachment ID for source URL.'); }

    $attachment_id = isset($_POST['attachment_id']) ? intval($_POST['attachment_id']) : 0;
    if ( empty( $attachment_id ) || get_post_type( $attachment_id ) !== 'attachment' ) {
        wp_send_json_error(['message' => 'A valid attachment ID is required.']);
    }
    ///end

    $this->_sync_annotation_tags_to_attachment($attachment_id, $annotation['body']);

    // --- START: MODIFIED LOGIC ---
    $snippet_data_url = null;
    $snippet_index = -1;

    // Find and extract the snippet from the annotation body
    if (isset($annotation['body']) && is_array($annotation['body'])) {
        foreach ($annotation['body'] as $index => $body_item) {
            if (isset($body_item['purpose']) && $body_item['purpose'] === 'arwai-snippet') {
                $snippet_data_url = $body_item['value'];
                $snippet_index = $index;
                break;
            }
        }
    }

    // If a snippet was found, remove it from the body array before saving the JSON
    if ($snippet_index > -1) {
        array_splice($annotation['body'], $snippet_index, 1);
    }
    // --- END: MODIFIED LOGIC ---


    $annotation_id_from_annotorious = $annotation['id'] ?? '';
    if (empty($annotation_id_from_annotorious)) { wp_send_json_error('Annotorious ID missing.'); }

    if (isset($annotation['body']) && is_array($annotation['body'])) {
        foreach ($annotation['body'] as $key => $body_item) {
            if (isset($body_item['purpose']) && $body_item['purpose'] === 'commenting' && isset($body_item['value'])) {
                $annotation['body'][$key]['value'] = wp_kses_post($body_item['value']);
            }
        }
    }

    // --- MODIFIED: Added the new column to the insert data array ---
    $insert_data = array(
        'annotation_id_from_annotorious' => $annotation_id_from_annotorious,
        'attachment_id' => $attachment_id,
        'annotation_data' => wp_json_encode($annotation),
        'annotation_snippet_data_url' => $snippet_data_url // Save snippet here
    );
    
    $insert_formats = array('%s', '%d', '%s', '%s');

    $inserted = $wpdb->insert($this->table_name, $insert_data, $insert_formats);

    if ($inserted) {
        $new_db_id = $wpdb->insert_id;

        $arwai_id_body = [
            'type'    => 'TextualBody',
            'purpose' => 'arwai-AnnotationID',
            'value'   => (string) $new_db_id,
        ];

        $annotation['body'][] = $arwai_id_body;

        $wpdb->update(
            $this->table_name,
            ['annotation_data' => wp_json_encode($annotation)],
            ['id' => $new_db_id],
            ['%s'],
            ['%d']
        );

        $wpdb->insert( $this->history_table_name, array(
            'annotation_id_from_annotorious' => $annotation_id_from_annotorious,
            'attachment_id' => $attachment_id,
            'action_type' => 'created',
            'annotation_data_snapshot' => wp_json_encode($annotation),
            'user_id' => get_current_user_id()
        ), array('%s', '%d', '%s', '%s', '%d') );

        // Add the snippet back for the frontend response so it renders immediately
        if ($snippet_data_url) {
             $annotation['body'][] = ['type' => 'TextualBody', 'purpose' => 'arwai-snippet', 'value' => $snippet_data_url];
        }

        wp_send_json_success(['annotation' => $annotation]);
    } else {
        wp_send_json_error(['message' => 'Failed to add annotation.']);
    }

    wp_die();
}

    function anno_delete() {
        if ( ! is_user_logged_in() ) {
            wp_send_json_error( 'You must be logged in to delete annotations.' );
        }

        global $wpdb;
        $annoid = isset($_POST['annotationid']) ? sanitize_text_field($_POST['annotationid']) : '';

            // The full annotation object may not be present on delete, so we get the ID directly.
    $attachment_id = isset($_POST['attachment_id']) ? intval($_POST['attachment_id']) : 0;

    if (empty($annoid) || empty($attachment_id)) { 
        wp_send_json_error('Missing annotation or attachment ID.'); 
    }

    if ( get_post_type( $attachment_id ) !== 'attachment' ) {
        wp_send_json_error(['message' => 'A valid attachment ID is required.']);
    }


        // $annotation_json = isset($_POST['annotation']) ? wp_unslash($_POST['annotation']) : '';
        // if (empty($annoid) || empty($annotation_json)) { wp_send_json_error('Missing data.'); }
        // $annotation = json_decode($annotation_json, true);
        // if (json_last_error() !== JSON_ERROR_NONE) { wp_send_json_error('Invalid JSON.'); }
        // $image_url = $annotation['target']['source'] ?? '';
        // $attachment_id = attachment_url_to_postid($image_url);
        // if (empty($attachment_id)) { wp_send_json_error('Could not find attachment ID.'); }

        $existing = $wpdb->get_row( $wpdb->prepare( "SELECT annotation_data FROM {$this->table_name} WHERE annotation_id_from_annotorious = %s AND attachment_id = %d", $annoid, $attachment_id ), ARRAY_A );
        if ($existing) {
            $wpdb->insert( $this->history_table_name, array('annotation_id_from_annotorious' => $annoid, 'attachment_id' => $attachment_id, 'action_type' => 'deleted', 'annotation_data_snapshot' => $existing['annotation_data'], 'user_id' => get_current_user_id()), array('%s', '%d', '%s', '%s', '%d') );
        }

        $deleted = $wpdb->delete( $this->table_name, array('annotation_id_from_annotorious' => $annoid, 'attachment_id' => $attachment_id), array('%s', '%d') );

        if ($deleted) { wp_send_json_success(); } else { wp_send_json_error(); }
        wp_die();
    }

function anno_update() {
    if ( ! is_user_logged_in() ) {
        wp_send_json_error( 'You must be logged in to update annotations.' );
    }

    global $wpdb;
    $annoid = isset($_POST['annotationid']) ? sanitize_text_field($_POST['annotationid']) : '';
    $annotation_json = isset($_POST['annotation']) ? wp_unslash($_POST['annotation']) : '';
    if (empty($annoid) || empty($annotation_json)) { wp_send_json_error('Missing data.'); }
    
    $annotation = json_decode($annotation_json, true);
    if (json_last_error() !== JSON_ERROR_NONE) { wp_send_json_error('Invalid JSON.'); }




    // $image_url = $annotation['target']['source'] ?? '';
    // $attachment_id = attachment_url_to_postid($image_url);
    // if (empty($attachment_id)) { wp_send_json_error('Could not find attachment ID.'); }

    $attachment_id = isset($_POST['attachment_id']) ? intval($_POST['attachment_id']) : 0;
    if ( empty( $attachment_id ) || get_post_type( $attachment_id ) !== 'attachment' ) {
        wp_send_json_error(['message' => 'A valid attachment ID is required.']);
    }
    // +++ ADD END +++


    $this->_sync_annotation_tags_to_attachment($attachment_id, $annotation['body']);

    // --- START: MODIFIED LOGIC ---
    $snippet_data_url = null;
    $snippet_index = -1;

    if (isset($annotation['body']) && is_array($annotation['body'])) {
        foreach ($annotation['body'] as $index => $body_item) {
            if (isset($body_item['purpose']) && $body_item['purpose'] === 'arwai-snippet') {
                $snippet_data_url = $body_item['value'];
                $snippet_index = $index;
                break;
            }
        }
    }

    if ($snippet_index > -1) {
        array_splice($annotation['body'], $snippet_index, 1);
    }
    // --- END: MODIFIED LOGIC ---

    if (isset($annotation['body'][0]['value'])) { $annotation['body'][0]['value'] = wp_kses_post($annotation['body'][0]['value']); }

    // --- MODIFIED: Update both columns ---
    $update_data = [
        'annotation_data' => wp_json_encode($annotation),
        'annotation_snippet_data_url' => $snippet_data_url
    ];

    $update_where = ['annotation_id_from_annotorious' => $annoid, 'attachment_id' => $attachment_id];

    $updated = $wpdb->update($this->table_name, $update_data, $update_where, ['%s', '%s'], ['%s', '%d']);

    if ($updated) {
        $wpdb->insert( $this->history_table_name, array('annotation_id_from_annotorious' => $annoid, 'attachment_id' => $attachment_id, 'action_type' => 'updated', 'annotation_data_snapshot' => wp_json_encode($annotation), 'user_id' => get_current_user_id()), array('%s', '%d', '%s', '%s', '%d') );
        wp_send_json_success();
    } else {
        // Even if no rows were changed, it's not a true error if the data was the same.
        wp_send_json_success(['message' => 'No changes detected.']);
    }
    wp_die();
}



    function get_annotorious_history() {
        global $wpdb;
        $attachment_id = isset($_GET['attachment_id']) ? intval($_GET['attachment_id']) : 0;
        $annotation_id = isset($_GET['annotation_id']) ? sanitize_text_field($_GET['annotation_id']) : '';
        if (empty($attachment_id) && empty($annotation_id)) { wp_send_json_error('Missing ID.'); }

        header('Content-Type: application/json');
        $query_params = [];
        $where_clauses = [];
        if ($attachment_id) { $where_clauses[] = 'attachment_id = %d'; $query_params[] = $attachment_id; }
        if ($annotation_id) { $where_clauses[] = 'annotation_id_from_annotorious = %s'; $query_params[] = $annotation_id; }
        $where_sql = implode(' AND ', $where_clauses);

        $sql = "SELECT * FROM {$this->history_table_name} WHERE {$where_sql} ORDER BY action_timestamp DESC";
        $results = $wpdb->get_results( $wpdb->prepare( $sql, $query_params ), ARRAY_A );

        $history_records = array_map(function($row) {
            $user_info = get_userdata( $row['user_id'] );
            return [
                'id' => (int) $row['id'],
                'annotationId' => $row['annotation_id_from_annotorious'],
                'attachmentId' => (int) $row['attachment_id'],
                'actionType' => $row['action_type'],
                'annotationData' => json_decode($row['annotation_data_snapshot']),
                'userId' => (int) $row['user_id'],
                'userName' => $user_info ? $user_info->display_name : 'Guest',
                'timestamp' => $row['action_timestamp'],
            ];
        }, $results);

        wp_send_json_success(['history' => $history_records]);
        wp_die();
    }
}

/**
 * Include attachments on archive, tag, and category pages.
 */
function arwai_include_attachments_in_archives( $query ) {
    // Only modify the main query on the front-end for archive pages.
    if ( ! is_admin() && $query->is_main_query() && ( $query->is_archive() || $query->is_tag() || $query->is_category() ) ) {

        // Get the existing post types from the query.
        $post_types = $query->get( 'post_type' );

        // If no post types are specified, default to 'post'.
        if ( empty( $post_types ) ) {
            $post_types = array('post');
        }

        // If it's a single string, make it an array.
        if ( is_string( $post_types ) ) {
            $post_types = array( $post_types );
        }

        // Add 'attachment' to the array of post types to query.
        if ( ! in_array( 'attachment', $post_types ) ) {
            $post_types[] = 'attachment';
        }

        $query->set( 'post_type', $post_types );

        // Also, query for attachments with a post_status of 'inherit' or 'publish'.
        $query->set( 'post_status', array( 'publish', 'inherit' ) );
    }
}
add_action( 'pre_get_posts', 'arwai_include_attachments_in_archives' );

/**
 * TARGETED RENDER FILTER: Modifies the Post Content block ONLY for attachments on archive pages.
 */
function arwai_wrap_attachment_content_in_permalink( $block_content, $block ) {
    // We only care about the 'core/post-content' block.
    if ( isset($block['blockName']) && $block['blockName'] === 'core/post-content' ) {

        // --- NEW DEBUGGING LINE ---
        // This will only appear if the 'core/post-content' block is actually being rendered.
        echo '';

        // This logic only runs if the post is an ATTACHMENT on a front-end archive page.
        if ( !is_admin() && is_archive() && get_post_type() === 'attachment' ) {

            $image_size = 'medium'; // <-- Set your desired size HERE
            $attachment_id = get_the_ID();
            $permalink     = get_permalink( $attachment_id );
            $image_html = wp_get_attachment_image( $attachment_id, $image_size );

            if ( $image_html && $permalink ) {
                return '
                    <figure class="arwai-archive-attachment-image">
                        <a href="' . esc_url( $permalink ) . '">' . $image_html . '</a>
                    </figure>
                ';
            }
        }
    }

    // For all other blocks/post types, return the original, unmodified content.
    return $block_content;
}
add_filter( 'render_block', 'arwai_wrap_attachment_content_in_permalink', 10, 2);

