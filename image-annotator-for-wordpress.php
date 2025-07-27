<?php
/*
    Plugin Name: Image Annotator for WordPress
    Plugin URI: https://arwai.me
    Description: A WordPress plugin to manage and annotate images with Annotorious.
    Version: 0.5.0
    Author: Arwai
*/

// If this file is called directly, abort.
if ( ! defined( 'WPINC' ) ) {
    die;
}

// Define plugin constants for URL and path
if ( ! defined( 'ARWAI_IMAGE_ANNOTATOR_URL' ) ) {
    define( 'ARWAI_IMAGE_ANNOTATOR_URL', plugin_dir_url( __FILE__ ) );
}
if ( ! defined( 'ARWAI_IMAGE_ANNOTATOR_PATH' ) ) {
    define( 'ARWAI_IMAGE_ANNOTATOR_PATH', plugin_dir_path( __FILE__ ) );
}

/**
 * The core plugin class that is used to define internationalization,
 * admin-specific hooks, and public-facing hooks.
 */
require ARWAI_IMAGE_ANNOTATOR_PATH . 'includes/class-image-annotator-for-wordpress.php';


/**
 * Begins execution of the plugin.
 */
function run_arwai_image_annotator_plugin() {
    new Image_Annotator_for_WordPress();
}
run_arwai_image_annotator_plugin();

/**
 * Activation Hook
 * Creates custom database tables on plugin activation.
 */
function arwai_image_annotator_activate() {
    global $wpdb;

    $table_name_data = $wpdb->prefix . 'annotorious_data';
    $table_name_history = $wpdb->prefix . 'annotorious_history';

    $charset_collate = $wpdb->get_charset_collate();

    // SQL for annotorious_data table
    $sql_data = "CREATE TABLE $table_name_data (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        annotation_id_from_annotorious VARCHAR(255) NOT NULL,
        attachment_id BIGINT(20) UNSIGNED NOT NULL,
        annotation_data LONGTEXT NOT NULL,
        annotation_snippet_data_url LONGTEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY annotorious_id (annotation_id_from_annotorious),
        KEY attachment_id (attachment_id)
    ) $charset_collate;";

    // SQL for annotorious_history table
    $sql_history = "CREATE TABLE $table_name_history (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        annotation_id_from_annotorious VARCHAR(255) NOT NULL,
        attachment_id BIGINT(20) UNSIGNED NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        annotation_data_snapshot LONGTEXT NOT NULL,
        user_id BIGINT(20) UNSIGNED,
        action_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY annotorious_id_idx (annotation_id_from_annotorious),
        KEY attachment_id_idx (attachment_id),
        KEY user_id_idx (user_id)
    ) $charset_collate;";

    require_once( ABSPATH . 'wp-admin/includes/upgrade.php' );
    dbDelta( $sql_data );
    dbDelta( $sql_history );
}
register_activation_hook( __FILE__, 'arwai_image_annotator_activate' );

// Adds a custom meta tag to the head section of the page to optimize mobile responsiveness in portrait mode.
    function arwai_add_custom_meta_tag() {
    echo '<meta name="viewport" content="width=device-width, initial-scale=1" />';
}
        add_action('wp_head', 'arwai_add_custom_meta_tag');
