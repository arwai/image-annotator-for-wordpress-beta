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

    // Meta and Option Keys
    const META_POST_DISPLAY_MODE = '_arwai_image_annotator_post_display_mode';
    const OPTION_DEFAULT_NEW_POST_MODE = 'arwai_image_annotator_default_new_post_mode';
    const META_SET_FIRST_AS_FEATURED = '_arwai_image_annotator_set_first_as_featured';
    const OPTION_ACTIVE_POST_TYPES = 'arwai_image_annotator_active_post_types';
    const META_IMAGE_IDS = '_arwai_multi_image_ids';
    const ATTACHMENT_META_IIIF_SOURCE = '_iiif_source_url';

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

        add_action( 'wp_enqueue_scripts', array( $this, 'load_public_scripts' ) );
        add_filter( 'pre_get_comments', array( $this, 'exclude_annotation_logs_from_comments' ) );
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
        add_action( 'rest_api_init', array( $this, 'register_rest_routes' ) );

        add_action( 'wp_ajax_arwai_get_annotorious_history', array( $this, 'get_annotorious_history' ) );
        add_action( 'wp_ajax_nopriv_arwai_get_annotorious_history', array( $this, 'get_annotorious_history' ) );
        add_action( 'wp_ajax_arwai_add_taxonomy_term', array( $this, 'arwai_add_taxonomy_term' ) );
        add_action( 'wp_ajax_arwai_sideload_iiif', array( $this, 'arwai_sideload_iiif' ) );

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

    public function register_rest_routes() {
        register_rest_route( 'arwai/v1', '/annotations/(?P<attachment_id>\d+)', array(
            array(
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => array( $this, 'rest_anno_get' ),
                'permission_callback' => '__return_true', // Anyone can read
                'args'                => array(
                    'attachment_id' => array(
                        'validate_callback' => function($param, $request, $key) {
                            return is_numeric( $param );
                        }
                    ),
                ),
            ),
            array(
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => array( $this, 'rest_anno_add' ),
                'permission_callback' => function () {
                    return current_user_can( 'edit_posts' );
                },
                'args'                => array(
                    'attachment_id' => array(
                        'validate_callback' => function($param, $request, $key) {
                            return is_numeric( $param );
                        }
                    ),
                ),
            ),
        ) );

        register_rest_route( 'arwai/v1', '/annotations/(?P<attachment_id>\d+)/(?P<annotation_id>[a-zA-Z0-9\-_]+)', array(
            array(
                'methods'             => WP_REST_Server::EDITABLE, // PUT or PATCH
                'callback'            => array( $this, 'rest_anno_update' ),
                'permission_callback' => function () {
                    return current_user_can( 'edit_posts' );
                },
                'args'                => array(
                    'attachment_id' => array(
                        'validate_callback' => function($param, $request, $key) {
                            return is_numeric( $param );
                        }
                    ),
                ),
            ),
            array(
                'methods'             => WP_REST_Server::DELETABLE, // DELETE
                'callback'            => array( $this, 'rest_anno_delete' ),
                'permission_callback' => function () {
                    return current_user_can( 'edit_posts' );
                },
                'args'                => array(
                    'attachment_id' => array(
                        'validate_callback' => function($param, $request, $key) {
                            return is_numeric( $param );
                        }
                    ),
                ),
            ),
        ) );
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

            ccc
            <form action="options.php" method="post">
                <?php
                submit_button( 'Save Settings' );
                settings_fields( 'arwai_image_annotator_options_group' );
                do_settings_sections( 'arwai-image-annotator-settings' );
                submit_button( 'Save Settings' );
                ?>
            </form>
            <div class="arwai-shortcode-guide">
                <h2><?php _e( 'Shortcode Guide', 'arwai-image-annotator' ); ?></h2>
                <p><?php _e( 'Use the following shortcodes to place viewer components in your post content.', 'arwai-image-annotator' ); ?></p>

                <div class="arwai-shortcode-entry">
                    <h4><?php _e( 'All Image Tags List', 'arwai-image-annotator' ); ?></h4>
                    <p><code>[arwai_all_tags_list]</code></p>
                    <p class="description">
                        <?php _e( 'Displays a list of all unique tags found across all annotations in the current post\'s image collection. If you have linked a taxonomy in the settings above, these tags will link to their respective archive pages.', 'arwai-image-annotator' ); ?>
                    </p>
                </div>
            </div>

        </div>
        <?php
    }


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
                    $iiif_source = get_post_meta( $id, self::ATTACHMENT_META_IIIF_SOURCE, true );
                    $iiif_image_url = get_post_meta( $id, '_iiif_image_url', true );

                    if ($large_src && $full_src) {
                        $carry[] = [
                            'post_id'      => $id,
                            'largeUrl'     => $large_src[0],
                            'fullUrl'      => $full_src[0],
                            'thumbnailUrl' => $thumb_src ? $thumb_src[0] : '',
                            'iiif_source_url' => !empty($iiif_source) ? $iiif_source : $full_src[0],
                            'iiif_image_url'  => !empty($iiif_image_url) ? $iiif_image_url : $full_src[0]
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
                        'annoNonce'    => wp_create_nonce( 'wp_rest' ),
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
                        'post_id'       => $post_id,
                        'ajax_url'      => admin_url( 'admin-ajax.php' ),
                        'rest_url'      => esc_url_raw( rest_url() ),
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
                wp_localize_script('arwai-admin-js', 'Arwai_Admin_Data', array(
                    'ajax_url' => admin_url('admin-ajax.php'),
                    'sideload_nonce' => wp_create_nonce('arwai_sideload_nonce')
                ));
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

                            <!-- Activity Feed Sidebar Container (Hidden via CSS transform initially) -->
                            <div id='arwai-history-sidebar'>
                                <div style='display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ddd; padding-bottom: 10px; margin-bottom: 10px;'>
                                    <h4 style='margin: 0; font-size: 14px;'>Activity Timeline</h4>
                                    <button id='arwai-close-history' style='background: none; border: none; cursor: pointer; padding: 0;'><span data-feather='x' style='width: 16px; height: 16px;'></span></button>
                                </div>
                                <div id='arwai-history-feed-content'>
                                    <div style='text-align: center; color: #888; font-size: 12px; margin-top: 20px;'>Click the clock icon to load history.</div>
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
                                    
<div class='arwai-simple-viewer-button-wrapper'>
    <button id='arwai-history' class='arwai-simple-toggle' title='Toggle History Timeline'>
        <span data-feather='clock'></span>
    </button>
    <span>History</span>
</div>


                                </div>
                                
                            </div>

                        </div>

                        <div id='arwai-single-annotation-container'>
                            <ul id='arwai-single-annotation'></ul>
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

        // Add meta boxes to supported post types
        if (!empty($active_post_types)) {
            add_meta_box('arwai-image-annotator-display-mode-metabox', __('Viewer Mode', 'arwai-image-annotator'), array( $this, 'render_display_mode_metabox' ), $active_post_types, 'side');
            add_meta_box('arwai-multi-image-uploader-metabox', __('Image Collection (sortable)', 'arwai-image-annotator'), array( $this, 'render_multi_image_uploader_metabox' ), $active_post_types, 'normal', 'high');
        }

        // Add history meta box to the attachment post type
        add_meta_box('arwai-image-annotator-history-metabox', __('Annotation History Logs', 'arwai-image-annotator'), array( $this, 'render_history_metabox' ), 'attachment', 'normal', 'high');
    }

    private function process_history_comments( $history_comments ) {
        // Reverse array to process from oldest to newest to compute forward diffs
        $history_comments_asc = array_reverse( $history_comments );
        $state_by_anno_id = [];
        $processed_history = [];

        foreach ($history_comments_asc as $comment) {
            $action_type   = get_comment_meta( $comment->comment_ID, '_arwai_action_type', true );
            $annotation_id = get_comment_meta( $comment->comment_ID, '_arwai_annotation_id', true );
            $snapshot_json = get_comment_meta( $comment->comment_ID, '_arwai_annotation_snapshot', true );
            $snapshot      = json_decode( $snapshot_json, true );

            $diff_text = '';

            if ($action_type === 'create') {
                $diff_text = 'Created annotation.';
                $state_by_anno_id[$annotation_id] = $snapshot;
            } elseif ($action_type === 'delete') {
                $diff_text = 'Deleted annotation.';
                unset($state_by_anno_id[$annotation_id]);
            } elseif ($action_type === 'update') {
                $prev_snapshot = isset($state_by_anno_id[$annotation_id]) ? $state_by_anno_id[$annotation_id] : null;

                if ($prev_snapshot) {
                    $curr_bodies = isset($snapshot['body']) ? $snapshot['body'] : [];
                    $prev_bodies = isset($prev_snapshot['body']) ? $prev_snapshot['body'] : [];

                    // Tags
                    $added_tags = [];
                    $removed_tags = [];
                    foreach ($curr_bodies as $b) {
                        if (isset($b['purpose']) && $b['purpose'] === 'tagging') {
                            $found = false;
                            foreach ($prev_bodies as $pb) { if (isset($pb['purpose']) && $pb['purpose'] === 'tagging' && $pb['value'] === $b['value']) $found = true; }
                            if (!$found) $added_tags[] = $b['value'];
                        }
                    }
                    foreach ($prev_bodies as $pb) {
                        if (isset($pb['purpose']) && $pb['purpose'] === 'tagging') {
                            $found = false;
                            foreach ($curr_bodies as $b) { if (isset($b['purpose']) && $b['purpose'] === 'tagging' && $b['value'] === $pb['value']) $found = true; }
                            if (!$found) $removed_tags[] = $pb['value'];
                        }
                    }

                    if (!empty($added_tags)) $diff_text .= '<strong>Added tag:</strong> ' . implode(', ', array_map('esc_html', $added_tags)) . '<br>';
                    if (!empty($removed_tags)) $diff_text .= '<strong>Removed tag:</strong> ' . implode(', ', array_map('esc_html', $removed_tags)) . '<br>';

                    // Comments & Replies
                    $process_text_bodies = function($purpose, $curr_b, $prev_b, $add_label, $upd_label, $del_label) use (&$diff_text) {
                        $curr_arr = []; $prev_arr = [];
                        foreach ($curr_b as $b) { if (isset($b['purpose']) && $b['purpose'] === $purpose) $curr_arr[] = $b['value']; }
                        foreach ($prev_b as $pb) { if (isset($pb['purpose']) && $pb['purpose'] === $purpose) $prev_arr[] = $pb['value']; }

                        // Simple array diffing assuming order maps somewhat linearly
                        // For comments, usually there's only 1. For replies, there are many.
                        $max_len = max(count($curr_arr), count($prev_arr));
                        for ($i = 0; $i < $max_len; $i++) {
                            $curr_val = isset($curr_arr[$i]) ? $curr_arr[$i] : null;
                            $prev_val = isset($prev_arr[$i]) ? $prev_arr[$i] : null;

                            if ($curr_val !== $prev_val) {
                                if ($prev_val === null && $curr_val !== null) {
                                    $diff_text .= '<strong>' . $add_label . ':</strong> "' . esc_html($curr_val) . '"<br>';
                                } elseif ($curr_val === null && $prev_val !== null) {
                                    $diff_text .= '<strong>' . $del_label . ':</strong> "' . esc_html($prev_val) . '"<br>';
                                } else {
                                    $diff_text .= '<strong>' . $upd_label . ':</strong> "' . esc_html($curr_val) . '"<br>';
                                }
                            }
                        }
                    };

                    $process_text_bodies('commenting', $curr_bodies, $prev_bodies, 'Added comment', 'Updated comment', 'Deleted comment');
                    $process_text_bodies('replying', $curr_bodies, $prev_bodies, 'Added reply', 'Updated reply', 'Deleted reply');

                    if (empty($diff_text)) $diff_text = 'Updated geometry/position.';

                } else {
                    $diff_text = 'Updated annotation.';
                }

                $state_by_anno_id[$annotation_id] = $snapshot;
            }

            $timestamp_iso = get_comment_date('c', $comment->comment_ID);
            $timestamp_local = date_i18n( get_option('date_format') . ' ' . get_option('time_format'), strtotime($comment->comment_date) );

            $processed_history[] = [
                'comment_obj'    => $comment,
                'id'             => (int) $comment->comment_ID,
                'annotationId'   => $annotation_id,
                'attachmentId'   => (int) $comment->comment_post_ID,
                'actionType'     => $action_type,
                'annotationData' => $snapshot,
                'userId'         => (int) $comment->user_id,
                'userName'       => $comment->comment_author,
                'timestamp'      => $timestamp_iso,
                'timestamp_local'=> $timestamp_local,
                'diffText'       => $diff_text,
                'snapshot_json'  => $snapshot_json
            ];
        }

        // Return reverse chronological (newest first)
        return array_reverse($processed_history);
    }

    public function render_history_metabox( $post ) {
        $args = [
            'post_id'             => $post->ID,
            'comment_type'        => 'image_annotation_log',
            'arwai_bypass_filter' => true,
            'orderby'             => 'comment_date',
            'order'               => 'DESC',
        ];

        $history_comments = get_comments( $args );

        if ( empty( $history_comments ) ) {
            echo '<p>' . __( 'No annotation history logs found for this image.', 'arwai-image-annotator' ) . '</p>';
            return;
        }

        $processed_history = $this->process_history_comments( $history_comments );

        ?>
        <div class="arwai-history-table-wrapper">
            <table class="widefat fixed striped">
                <thead>
                    <tr>
                        <th style="width: 20%;">Date</th>
                        <th style="width: 15%;">User</th>
                        <th style="width: 15%;">Action</th>
                        <th style="width: 50%;">Details & Data Snapshot</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ( $processed_history as $item ) :
                        $action_type = $item['actionType'];
                        $action_label = ucfirst( $action_type );
                        $action_color = '#666';
                        if ($action_type === 'create') $action_color = '#46b450';
                        if ($action_type === 'update') $action_color = '#0073aa';
                        if ($action_type === 'delete') $action_color = '#dc3232';
                    ?>
                    <tr>
                        <td><?php echo esc_html( $item['timestamp_local'] ); ?></td>
                        <td><?php echo esc_html( $item['userName'] ); ?></td>
                        <td><span style="color: white; background: <?php echo esc_attr($action_color); ?>; padding: 2px 6px; border-radius: 3px; font-size: 12px; font-weight: bold;"><?php echo esc_html( $action_label ); ?></span></td>
                        <td>
                            <strong>ID:</strong> <code><?php echo esc_html( $item['annotationId'] ); ?></code><br/>
                            <div style="margin: 8px 0; font-size: 13px;">
                                <?php echo wp_kses_post( $item['diffText'] ); ?>
                            </div>
                            <a href="#" class="button button-small arwai-toggle-snapshot" style="margin-top: 5px;">Toggle Raw JSON</a>
                            <div class="arwai-snapshot-data" style="display: none; margin-top: 10px; background: #f0f0f0; padding: 10px; border: 1px solid #ccc; max-height: 200px; overflow-y: auto;">
                                <pre style="margin:0; white-space: pre-wrap; font-size: 11px;"><?php echo esc_html( wp_json_encode( $item['annotationData'], JSON_PRETTY_PRINT ) ); ?></pre>
                            </div>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <script>
            jQuery(document).ready(function($) {
                $('.arwai-toggle-snapshot').on('click', function(e) {
                    e.preventDefault();
                    $(this).siblings('.arwai-snapshot-data').slideToggle('fast');
                });
            });
        </script>
        <?php
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
            <hr />
            <p>
                <label for="iiif_image_url"><strong><?php _e( 'Remote tiny-iiif Endpoint URL', 'arwai-image-annotator' ); ?></strong></label><br />
                <div style="display: flex; gap: 10px; align-items: center;">
                    <input type="text" name="iiif_image_url" id="iiif_image_url" value="" class="large-text" placeholder="https://example.com/iiif/image/info.json" />
                    <button type="button" id="arwai-iiif-upload-button" class="button button-primary"><?php _e( 'Upload', 'arwai-image-annotator' ); ?></button>
                </div>
                <small class="description"><?php _e( 'Enter a tiny-iiif Image or Manifest URL to sideload it into the collection.', 'arwai-image-annotator' ); ?></small>
                <div id="arwai-iiif-status" style="margin-top: 5px; display: none;"></div>
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

        // Handle IIIF URL Sideloading
        if ( isset( $_POST['iiif_image_url'] ) ) {
            $iiif_url = esc_url_raw( $_POST['iiif_image_url'] );
            if ( ! empty( $iiif_url ) ) {
                update_post_meta( $post_id, 'iiif_image_url', $iiif_url );
                $this->sideload_iiif_image( $post_id, $iiif_url );
                delete_post_meta( $post_id, 'iiif_image_url' );
            }
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
     * AJAX handler for IIIF sideloading.
     */
    public function arwai_sideload_iiif() {
        global $wpdb;
        check_ajax_referer( 'arwai_sideload_nonce', 'nonce' );
        if ( ! current_user_can( 'edit_posts' ) ) {
            wp_send_json_error( 'Permission denied.' );
        }

        $post_id = isset($_POST['post_id']) ? intval($_POST['post_id']) : 0;
        $iiif_url = isset($_POST['iiif_url']) ? esc_url_raw($_POST['iiif_url']) : '';

        if ( empty($post_id) || empty($iiif_url) ) {
            wp_send_json_error( 'Missing parameters.' );
        }

        $attach_id = $this->sideload_iiif_image( $post_id, $iiif_url );

        if ( $attach_id ) {
            $thumb_url = wp_get_attachment_image_url( $attach_id, 'thumbnail' );
            wp_send_json_success( array(
                'attach_id' => $attach_id,
                'thumb_url' => $thumb_url
            ) );
        } else {
            wp_send_json_error( 'Failed to sideload image. Please check the URL and try again.' );
        }
    }

    /**
     * Sideloads an image from a IIIF endpoint or Manifest and attaches it to the post.
     *
     * @param int    $post_id  The ID of the post to attach the image to.
     * @param string $iiif_url The IIIF endpoint or Manifest URL.
     * @return int|bool The attachment ID on success, false on failure.
     */
    private function sideload_iiif_image( $post_id, $iiif_url ) {
        global $wpdb;
        // Initial fetch to determine if it's a manifest
        $response = wp_remote_get( $iiif_url, array( 'timeout' => 30 ) );
        if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
            return false;
        }

        $data = json_decode( wp_remote_retrieve_body( $response ), true );
        $real_iiif_image_url = $iiif_url;

        // IIIF Manifest Detection & Parsing
        if ( $data && ( (isset($data['@type']) && $data['@type'] === 'sc:Manifest') || (isset($data['type']) && $data['type'] === 'Manifest') ) ) {
            // IIIF v2
            if ( isset($data['sequences'][0]['canvases'][0]['images'][0]['resource']['service']['@id']) ) {
                $real_iiif_image_url = $data['sequences'][0]['canvases'][0]['images'][0]['resource']['service']['@id'];
            }
            // IIIF v3
            elseif ( isset($data['items'][0]['items'][0]['items'][0]['body']['service'][0]['id']) ) {
                 $real_iiif_image_url = $data['items'][0]['items'][0]['items'][0]['body']['service'][0]['id'];
            }
            // Alternative IIIF v3 structure
            elseif ( isset($data['items'][0]['items'][0]['items'][0]['body']['id']) && isset($data['items'][0]['items'][0]['items'][0]['body']['type']) && $data['items'][0]['items'][0]['items'][0]['body']['type'] === 'Image' ) {
                 $real_iiif_image_url = $data['items'][0]['items'][0]['items'][0]['body']['id'];
            }
            // Fallback to resource ID if no service (v2)
            elseif ( isset($data['sequences'][0]['canvases'][0]['images'][0]['resource']['@id']) ) {
                $real_iiif_image_url = $data['sequences'][0]['canvases'][0]['images'][0]['resource']['@id'];
            }

            // Ensure we point to info.json if it's a service base URL
            if ( !preg_match('/\.(jpg|jpeg|png|webp|json)$/i', $real_iiif_image_url) ) {
                $real_iiif_image_url = rtrim($real_iiif_image_url, '/') . '/info.json';
            }
        }

        $preview_url = $real_iiif_image_url;
        if ( strpos( $preview_url, 'info.json' ) !== false ) {
            $preview_url = str_replace( 'info.json', 'full/1200,/0/default.jpg', $preview_url );
        } elseif ( !preg_match('/\.(jpg|jpeg|png|webp)$/i', $preview_url) ) {
            $preview_url = rtrim($preview_url, '/') . '/full/1200,/0/default.jpg';
        }

        $img_response = wp_remote_get( $preview_url, array( 'timeout' => 30 ) );
        if ( is_wp_error( $img_response ) || 200 !== wp_remote_retrieve_response_code( $img_response ) ) {
             // Fallback to direct URL if preview fetch fails
             $img_response = wp_remote_get( $real_iiif_image_url, array( 'timeout' => 30 ) );
             if ( is_wp_error( $img_response ) || 200 !== wp_remote_retrieve_response_code( $img_response ) ) {
                 return false;
             }
        }

        $image_data = wp_remote_retrieve_body( $img_response );
        $filename = basename( parse_url( $iiif_url, PHP_URL_PATH ) );
        if ( empty( $filename ) || $filename === 'info.json' || $filename === 'manifest' ) {
            $filename = 'iiif-image-' . time() . '.jpg';
        } else {
             $filename = str_replace('.json', '.jpg', $filename);
             if (strpos($filename, '.') === false) $filename .= '.jpg';
        }

        $upload = wp_upload_bits( $filename, null, $image_data );
        if ( $upload['error'] ) {
            return false;
        }

        $wp_filetype = wp_check_filetype( $upload['file'], null );
        $attachment = array(
            'post_mime_type' => $wp_filetype['type'],
            'post_title'     => sanitize_file_name( $filename ),
            'post_content'   => '',
            'post_status'    => 'inherit'
        );

        $attach_id = wp_insert_attachment( $attachment, $upload['file'], $post_id );
        if ( ! is_wp_error( $attach_id ) ) {
            // Update GUID to the file URL
            $wpdb->update( $wpdb->posts, array( 'guid' => $upload['url'] ), array( 'ID' => $attach_id ) );

            require_once( ABSPATH . 'wp-admin/includes/image.php' );
            $attach_data = wp_generate_attachment_metadata( $attach_id, $upload['file'] );
            wp_update_attachment_metadata( $attach_id, $attach_data );

            // Store the original entered URL and the extracted image service URL
            update_post_meta( $attach_id, self::ATTACHMENT_META_IIIF_SOURCE, $iiif_url );
            update_post_meta( $attach_id, '_iiif_image_url', $real_iiif_image_url );

            // Add to post collection
            $image_ids_json = get_post_meta( $post_id, self::META_IMAGE_IDS, true );
            $image_ids = json_decode( $image_ids_json, true );
            if ( ! is_array( $image_ids ) ) { $image_ids = array(); }
            $image_ids[] = $attach_id;
            update_post_meta( $post_id, self::META_IMAGE_IDS, json_encode( array_values( array_map( 'intval', $image_ids ) ) ) );

            // Set as featured if none exists
            if ( ! has_post_thumbnail( $post_id ) ) {
                set_post_thumbnail( $post_id, $attach_id );
            }
            return $attach_id;
        }
        return false;
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

    /**
     * Logs an annotation action (create, update, delete) to the native WordPress comment system.
     *
     * @param int    $attachment_id  The ID of the media attachment post.
     * @param string $action_type    The type of action ('create', 'update', 'delete').
     * @param string $annotation_data The JSON string of the annotation data.
     * @param string $annotation_id  The Annotorious string ID.
     * @param int    $post_id        The post ID context, if any.
     */
    private function log_annotation_action( $attachment_id, $action_type, $annotation_data, $annotation_id, $post_id = 0 ) {
        $user_id = get_current_user_id();
        $user = wp_get_current_user();
        $user_name = $user->exists() ? $user->display_name : 'Unknown User';

        $action_verb = 'updated';
        if ( $action_type === 'create' ) {
            $action_verb = 'created';
        } elseif ( $action_type === 'delete' ) {
            $action_verb = 'deleted';
        }

        $comment_content = sprintf( 'Annotation %s by %s', $action_verb, $user_name );

        $commentdata = array(
            'comment_post_ID'      => $attachment_id,
            'comment_author'       => $user_name,
            'comment_author_email' => $user->exists() ? $user->user_email : '',
            'comment_content'      => $comment_content,
            'comment_type'         => 'image_annotation_log',
            'user_id'              => $user_id,
            'comment_approved'     => 1, // Automatically approve
        );

        $comment_id = wp_insert_comment( $commentdata );

        if ( $comment_id && ! is_wp_error( $comment_id ) ) {
            add_comment_meta( $comment_id, '_arwai_annotation_snapshot', $annotation_data );
            add_comment_meta( $comment_id, '_arwai_annotation_id', $annotation_id );
            add_comment_meta( $comment_id, '_arwai_action_type', $action_type );
            if ( $post_id ) {
                add_comment_meta( $comment_id, '_arwai_post_id', $post_id );
            }
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

    public function rest_anno_get( WP_REST_Request $request ) {
        global $wpdb;
        $attachment_id = $request->get_param( 'attachment_id' );

        $all_annotations = [];
        $results = $wpdb->get_results( $wpdb->prepare( "SELECT annotation_data FROM {$this->table_name} WHERE attachment_id = %d", $attachment_id ), ARRAY_A );

        if ( ! empty( $results ) ) {
            foreach ( $results as $row ) {
                $decoded_annotation = json_decode( $row['annotation_data'], true );
                if ( json_last_error() === JSON_ERROR_NONE ) {
                    $all_annotations[] = $decoded_annotation;
                }
            }
        }

        return rest_ensure_response( $all_annotations );
    }

    public function rest_anno_add( WP_REST_Request $request ) {
        global $wpdb;

        $attachment_id = $request->get_param( 'attachment_id' );
        $annotation_json = $request->get_param( 'annotation' );
        $iiif_source_url = $request->get_param( 'iiif_source_url' ) ? esc_url_raw( $request->get_param( 'iiif_source_url' ) ) : '';
        $parent_post_id = $request->get_param( 'post_id' ) ? intval( $request->get_param( 'post_id' ) ) : 0;

        if ( empty( $annotation_json ) ) {
            return new WP_Error( 'missing_data', 'Annotation data missing.', array( 'status' => 400 ) );
        }

        // JS sends JSON payload, sometimes it might be already parsed if it was sent as application/json body
        if ( is_string( $annotation_json ) ) {
            $annotation = json_decode( wp_unslash( $annotation_json ), true );
            if ( json_last_error() !== JSON_ERROR_NONE ) {
                return new WP_Error( 'invalid_json', 'Invalid JSON data.', array( 'status' => 400 ) );
            }
        } else {
            $annotation = $annotation_json;
        }

        if ( empty( $attachment_id ) ) {
            $image_url = $annotation['target']['source'] ?? '';
            if ( ! empty( $image_url ) ) {
                $attachment_id = attachment_url_to_postid( $image_url );
            }
        }

        if ( empty( $attachment_id ) ) {
            return new WP_Error( 'missing_attachment_id', 'Could not find attachment ID.', array( 'status' => 400 ) );
        }

        $this->_sync_annotation_tags_to_attachment( $attachment_id, $annotation['body'] ?? [] );

        $annotation_id_from_annotorious = $annotation['id'] ?? '';
        if ( empty( $annotation_id_from_annotorious ) ) {
            return new WP_Error( 'missing_annotorious_id', 'Annotorious ID missing.', array( 'status' => 400 ) );
        }

        // Sanitize annotation body
        if ( isset( $annotation['body'] ) && is_array( $annotation['body'] ) ) {
            foreach ( $annotation['body'] as $key => $body_item ) {
                if ( isset( $body_item['value'] ) && is_string( $body_item['value'] ) ) {
                    if ( isset( $body_item['purpose'] ) && $body_item['purpose'] === 'arwai-snippet' ) {
                        continue;
                    }
                    if ( isset( $body_item['purpose'] ) && ( $body_item['purpose'] === 'commenting' || $body_item['purpose'] === 'replying' ) ) {
                        $annotation['body'][$key]['value'] = wp_kses_post( $body_item['value'] );
                    } else {
                        $annotation['body'][$key]['value'] = sanitize_text_field( $body_item['value'] );
                    }
                }
            }
        }

        $inserted = $wpdb->insert(
            $this->table_name,
            array(
                'annotation_id_from_annotorious' => $annotation_id_from_annotorious,
                'attachment_id' => $attachment_id,
                'post_id' => $parent_post_id,
                'iiif_source_url' => $iiif_source_url,
                'annotation_data' => wp_json_encode( $annotation )
            ),
            array( '%s', '%d', '%d', '%s', '%s' )
        );

        if ( $inserted ) {
            $new_db_id = $wpdb->insert_id;

            $arwai_id_body = [
                'type'    => 'TextualBody',
                'purpose' => 'arwai-AnnotationID',
                'value'   => (string) $new_db_id,
            ];

            if ( ! isset( $annotation['body'] ) || ! is_array( $annotation['body'] ) ) {
                $annotation['body'] = [];
            }
            $annotation['body'][] = $arwai_id_body;

            $wpdb->update(
                $this->table_name,
                ['annotation_data' => wp_json_encode( $annotation )],
                ['id' => $new_db_id],
                ['%s'],
                ['%d']
            );

            $this->log_annotation_action(
                $attachment_id,
                'create',
                wp_json_encode( $annotation ),
                $annotation_id_from_annotorious,
                $parent_post_id
            );

            $response = rest_ensure_response( array( 'annotation' => $annotation ) );
            $response->set_status( 201 );
            return $response;

        } else {
            return new WP_Error( 'db_insert_error', 'Failed to add annotation.', array( 'status' => 500 ) );
        }
    }

    public function rest_anno_update( WP_REST_Request $request ) {
        global $wpdb;

        $attachment_id = $request->get_param( 'attachment_id' );
        $annoid = $request->get_param( 'annotation_id' );
        $annotation_json = $request->get_param( 'annotation' );
        $iiif_source_url = $request->get_param( 'iiif_source_url' ) ? esc_url_raw( $request->get_param( 'iiif_source_url' ) ) : '';
        $parent_post_id = $request->get_param( 'post_id' ) ? intval( $request->get_param( 'post_id' ) ) : 0;

        if ( empty( $annoid ) || empty( $annotation_json ) ) {
            return new WP_Error( 'missing_data', 'Missing data.', array( 'status' => 400 ) );
        }

        if ( is_string( $annotation_json ) ) {
            $annotation = json_decode( wp_unslash( $annotation_json ), true );
            if ( json_last_error() !== JSON_ERROR_NONE ) {
                return new WP_Error( 'invalid_json', 'Invalid JSON.', array( 'status' => 400 ) );
            }
        } else {
            $annotation = $annotation_json;
        }

        if ( empty( $attachment_id ) ) {
            $image_url = $annotation['target']['source'] ?? '';
            if ( ! empty( $image_url ) ) {
                $attachment_id = attachment_url_to_postid( $image_url );
            }
        }

        if ( empty( $attachment_id ) ) {
            return new WP_Error( 'missing_attachment_id', 'Could not find attachment ID.', array( 'status' => 400 ) );
        }

        $this->_sync_annotation_tags_to_attachment( $attachment_id, $annotation['body'] ?? [] );

        // Sanitize annotation body
        if ( isset( $annotation['body'] ) && is_array( $annotation['body'] ) ) {
            foreach ( $annotation['body'] as $key => $body_item ) {
                if ( isset( $body_item['value'] ) && is_string( $body_item['value'] ) ) {
                    if ( isset( $body_item['purpose'] ) && $body_item['purpose'] === 'arwai-snippet' ) {
                        continue;
                    }
                    if ( isset( $body_item['purpose'] ) && ( $body_item['purpose'] === 'commenting' || $body_item['purpose'] === 'replying' ) ) {
                        $annotation['body'][$key]['value'] = wp_kses_post( $body_item['value'] );
                    } else {
                        $annotation['body'][$key]['value'] = sanitize_text_field( $body_item['value'] );
                    }
                }
            }
        }

        $updated = $wpdb->update(
            $this->table_name,
            array(
                'annotation_data' => wp_json_encode( $annotation ),
                'post_id' => $parent_post_id,
                'iiif_source_url' => $iiif_source_url
            ),
            array( 'annotation_id_from_annotorious' => $annoid, 'attachment_id' => $attachment_id ),
            array( '%s', '%d', '%s' ),
            array( '%s', '%d' )
        );

        if ( false !== $updated ) {
            $this->log_annotation_action(
                $attachment_id,
                'update',
                wp_json_encode( $annotation ),
                $annoid,
                $parent_post_id
            );
            return rest_ensure_response( array( 'annotation' => $annotation ) );
        } else {
            return new WP_Error( 'db_update_error', 'Failed to update annotation.', array( 'status' => 500 ) );
        }
    }

    public function rest_anno_delete( WP_REST_Request $request ) {
        global $wpdb;

        $attachment_id = $request->get_param( 'attachment_id' );
        $annoid = $request->get_param( 'annotation_id' );
        $annotation_json = $request->get_param( 'annotation' );
        $parent_post_id = $request->get_param( 'post_id' ) ? intval( $request->get_param( 'post_id' ) ) : 0;

        if ( empty( $annoid ) ) {
            return new WP_Error( 'missing_data', 'Missing data.', array( 'status' => 400 ) );
        }

        $annotation = null;
        if ( ! empty( $annotation_json ) ) {
            if ( is_string( $annotation_json ) ) {
                $annotation = json_decode( wp_unslash( $annotation_json ), true );
            } else {
                $annotation = $annotation_json;
            }
        }

        if ( empty( $attachment_id ) && $annotation ) {
            $image_url = $annotation['target']['source'] ?? '';
            if ( ! empty( $image_url ) ) {
                $attachment_id = attachment_url_to_postid( $image_url );
            }
        }

        if ( empty( $attachment_id ) ) {
            return new WP_Error( 'missing_attachment_id', 'Could not find attachment ID.', array( 'status' => 400 ) );
        }

        $existing = $wpdb->get_row( $wpdb->prepare( "SELECT annotation_data FROM {$this->table_name} WHERE annotation_id_from_annotorious = %s AND attachment_id = %d", $annoid, $attachment_id ), ARRAY_A );
        if ( $existing ) {
            $this->log_annotation_action(
                $attachment_id,
                'delete',
                $existing['annotation_data'],
                $annoid,
                $parent_post_id
            );
        }

        $deleted = $wpdb->delete( $this->table_name, array( 'annotation_id_from_annotorious' => $annoid, 'attachment_id' => $attachment_id ), array( '%s', '%d' ) );

        if ( $deleted ) {
            $response = rest_ensure_response( null );
            $response->set_status( 204 ); // No content on successful delete
            return $response;
        } else {
            return new WP_Error( 'db_delete_error', 'Failed to delete annotation.', array( 'status' => 500 ) );
        }
    }



    function get_annotorious_history() {
        $attachment_id = isset($_GET['attachment_id']) ? intval($_GET['attachment_id']) : 0;
        $annotation_id = isset($_GET['annotation_id']) ? sanitize_text_field($_GET['annotation_id']) : '';
        if (empty($attachment_id) && empty($annotation_id)) { wp_send_json_error('Missing ID.'); }

        header('Content-Type: application/json');

        $args = [
            'comment_type'        => 'image_annotation_log',
            'arwai_bypass_filter' => true, // bypass global pre_get_comments hiding
            'orderby'             => 'comment_date',
            'order'               => 'DESC',
        ];

        if ( $attachment_id ) {
            $args['post_id'] = $attachment_id;
        }

        if ( ! empty( $annotation_id ) ) {
            $args['meta_query'] = [
                [
                    'key'     => '_arwai_annotation_id',
                    'value'   => $annotation_id,
                    'compare' => '=',
                ]
            ];
        }

        $comments = get_comments( $args );

        $processed_history = $this->process_history_comments( $comments );

        // Map it back to the exact JSON schema the frontend expects, now including diffText
        $history_records = array_map(function($item) {
            return [
                'id'             => $item['id'],
                'annotationId'   => $item['annotationId'],
                'attachmentId'   => $item['attachmentId'],
                'actionType'     => $item['actionType'],
                'annotationData' => $item['annotationData'],
                'userId'         => $item['userId'],
                'userName'       => $item['userName'],
                'timestamp'      => $item['timestamp'], // Use the ISO string for JS parsing
                'diffText'       => $item['diffText']
            ];
        }, $processed_history);

        wp_send_json_success(['history' => $history_records]);
        wp_die();
    }

    /**
     * Globally hides image_annotation_log comments unless explicitly requested.
     */
    public function exclude_annotation_logs_from_comments( $query ) {
        // If our custom flag 'arwai_bypass_filter' is set, we skip modification.
        if ( isset( $query->query_vars['arwai_bypass_filter'] ) && $query->query_vars['arwai_bypass_filter'] ) {
            return;
        }

        // Get current excluded comment types, if any.
        $type__not_in = isset( $query->query_vars['type__not_in'] ) ? $query->query_vars['type__not_in'] : array();

        // Ensure it's an array.
        if ( ! is_array( $type__not_in ) ) {
            $type__not_in = array( $type__not_in );
        }

        // Add our custom type to the exclusions.
        if ( ! in_array( 'image_annotation_log', $type__not_in, true ) ) {
            $type__not_in[] = 'image_annotation_log';
            $query->query_vars['type__not_in'] = $type__not_in;
        }
    }

    /**
     * Extracts a specific JSON value from an annotation's data.
     *
     * @param string $annotation_id_from_annotorious The Annotorious ID of the annotation.
     * @param string $json_path The JSON path to extract (e.g., '$.body[0].value').
     * @return string|null The extracted string value unquoted, or null if it doesn't exist.
     */
    public static function get_annotation_json_value( $annotation_id_from_annotorious, $json_path ) {
        global $wpdb;
        $table_name = $wpdb->prefix . 'annotorious_data';

        // To maintain strict compatibility with MariaDB 10.3+ (as the ->> operator was introduced in MariaDB 10.5.0),
        // we use JSON_UNQUOTE(JSON_EXTRACT(...)), which is functionally identical.

        $query = $wpdb->prepare(
            "SELECT JSON_UNQUOTE(JSON_EXTRACT(annotation_data, %s)) as extracted_val
             FROM {$table_name}
             WHERE annotation_id_from_annotorious = %s",
            $json_path,
            $annotation_id_from_annotorious
        );

        $result = $wpdb->get_var( $query );

        return $result !== null ? $result : null;
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