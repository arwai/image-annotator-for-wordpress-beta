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
        post_id BIGINT(20) UNSIGNED DEFAULT NULL,
        iiif_source_url VARCHAR(512) DEFAULT NULL,
        annotation_data LONGTEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY annotorious_id (annotation_id_from_annotorious),
        KEY attachment_id (attachment_id),
        KEY post_id (post_id)
    ) $charset_collate;";

    // SQL for annotorious_history table
    $sql_history = "CREATE TABLE $table_name_history (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        annotation_id_from_annotorious VARCHAR(255) NOT NULL,
        attachment_id BIGINT(20) UNSIGNED NOT NULL,
        post_id BIGINT(20) UNSIGNED DEFAULT NULL,
        iiif_source_url VARCHAR(512) DEFAULT NULL,
        action_type VARCHAR(50) NOT NULL,
        annotation_data_snapshot LONGTEXT NOT NULL,
        user_id BIGINT(20) UNSIGNED,
        action_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY annotorious_id_idx (annotation_id_from_annotorious),
        KEY attachment_id_idx (attachment_id),
        KEY post_id_idx (post_id),
        KEY user_id_idx (user_id)
    ) $charset_collate;";

    require_once( ABSPATH . 'wp-admin/includes/upgrade.php' );
    dbDelta( $sql_data );
    dbDelta( $sql_history );

    // Workaround for dbDelta's inability to handle JSON columns correctly.
    // Ensure data is valid JSON before attempting to ALTER the column.

    // Check if annotation_data in $table_name_data needs updating
    $column_data_info = $wpdb->get_row( "SHOW COLUMNS FROM {$table_name_data} LIKE 'annotation_data'" );
    // MariaDB stores JSON as LONGTEXT. To avoid infinite alter loops on MariaDB, we also check if the column has a JSON_VALID check constraint, or we can check SHOW CREATE TABLE.
    $create_table_data = $wpdb->get_row( "SHOW CREATE TABLE {$table_name_data}", ARRAY_N );
    $has_json_check_data = ( $create_table_data && stripos( $create_table_data[1], 'json_valid(`annotation_data`)' ) !== false );

    if ( $column_data_info && strtolower( $column_data_info->Type ) !== 'json' && ! $has_json_check_data ) {
        // Fix empty strings to be valid JSON
        $wpdb->query( "UPDATE {$table_name_data} SET annotation_data = '{}' WHERE annotation_data = ''" );
        // Alter column to JSON
        $wpdb->query( "ALTER TABLE {$table_name_data} MODIFY COLUMN annotation_data JSON" );
    }

    // Check if annotation_data_snapshot in $table_name_history needs updating
    $column_history_info = $wpdb->get_row( "SHOW COLUMNS FROM {$table_name_history} LIKE 'annotation_data_snapshot'" );
    $create_table_history = $wpdb->get_row( "SHOW CREATE TABLE {$table_name_history}", ARRAY_N );
    $has_json_check_history = ( $create_table_history && stripos( $create_table_history[1], 'json_valid(`annotation_data_snapshot`)' ) !== false );

    if ( $column_history_info && strtolower( $column_history_info->Type ) !== 'json' && ! $has_json_check_history ) {
        // Fix empty strings to be valid JSON
        $wpdb->query( "UPDATE {$table_name_history} SET annotation_data_snapshot = '{}' WHERE annotation_data_snapshot = ''" );
        // Alter column to JSON
        $wpdb->query( "ALTER TABLE {$table_name_history} MODIFY COLUMN annotation_data_snapshot JSON" );
    }
}
register_activation_hook( __FILE__, 'arwai_image_annotator_activate' );

// Adds a custom meta tag to the head section of the page to optimize mobile responsiveness in portrait mode.
    function arwai_add_custom_meta_tag() {
    echo '<meta name="viewport" content="width=device-width, initial-scale=1" />';
}
        add_action('wp_head', 'arwai_add_custom_meta_tag');
