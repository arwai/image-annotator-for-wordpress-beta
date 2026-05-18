Image Annotator for WordPress
Image Annotator for WordPress is a feature-rich plugin that allows users to manage, display, and interactively annotate images directly within WordPress. By leveraging powerful libraries like Annotorious and OpenSeadragon, it provides a seamless dual-viewing experience: a fast, responsive gallery for simple viewing, and a deep-zoom modal for precise annotation and editing.

🚀 Key Features
1. Dual Viewer System (Frontend)
Simple Viewer (Gallery Mode): A fast, lightweight slider (powered by Slick Carousel) for browsing multiple images in a collection. Annotations can be viewed in a read-only format.

Deep Zoom Viewer (OpenSeadragon Mode): Clicking the "Enlarge" button launches a fullscreen, high-resolution viewer. Users can pan, zoom smoothly, rotate the image, and actively create or edit annotations.

Responsive Image Loading: Automatically serves smaller medium_large images on mobile and swaps to high-resolution large or full images on desktop or when entering Deep Zoom mode.

2. Powerful Annotation Capabilities
Draw & Tag: Draw rectangular regions on images, add text comments, and apply tags.

Taxonomy Syncing: Optionally sync annotation tags directly to WordPress taxonomies (like Categories or Tags). This automatically assigns the tags you make on a specific image region to the WordPress Attachment post itself.

Image Snippet Capture: When an annotation is created or updated, the plugin automatically captures an internal base64 canvas snippet (thumbnail) of the exact annotated region.

Dynamic Formatting: Annotations tagged with "Important" (or "Importante") are automatically styled with a distinct visual highlight.

Annotation History Tracking: Every action (create, update, delete) is tracked in a custom database table (annotorious_history), recording the user, timestamp, and a snapshot of the data.

Relative Timestamps: Comments display user-friendly relative time (e.g., "just now", "5 minutes ago", "2 days ago").

3. Advanced Admin Controls & Metaboxes
Sortable Multi-Image Uploader: A custom drag-and-drop metabox using the native WordPress media library allows you to build and sort an "Image Collection" for any post.

Set Featured Image: A one-click toggle to automatically set the first image in your custom collection as the post's standard Featured Image.

Display Mode Toggle: Choose between rendering the viewer automatically via the default viewer mode or placing it manually using a Gutenberg block (block logic dependent on external/future files).

Post Type Support: Toggle exactly which Custom Post Types (Posts, Pages, or custom types) the plugin should be active on.

4. Shortcodes
Easily display tag data anywhere on your site:

[arwai_all_tags_list]: Displays a list of all unique tags found across all annotations in the current post's image collection. If linked to a taxonomy, these tags output as clickable archive links.

[arwai_post_tags_list]: Displays a simple list of the standard tags assigned to the current post.

🛠️ Technical Stack & Libraries
This plugin heavily integrates several open-source JavaScript libraries, loaded conditionally only when a post contains an image collection:

Annotorious: Handles the core drawing, rendering, and data structure of the annotations (using W3C Web Annotation Data Model).

OpenSeadragon: Provides the engine for deep zooming, panning, and high-resolution image rendering.

Slick Carousel: Powers the responsive image slider and thumbnail reference strip.

Feather Icons: Supplies the clean, SVG-based UI icons used throughout the viewer toolbars.

🗄️ Database Structure
Upon activation, the plugin creates two custom tables to ensure annotation data doesn't bloat your standard wp_posts or wp_postmeta tables:

wp_annotorious_data: Stores the active W3C JSON annotation data, linked to the WordPress Attachment ID.

wp_annotorious_history: An audit log storing action types (created/updated/deleted), user IDs, timestamps, and JSON snapshots.

⚙️ How to Use (Quick Start)
Activate the Plugin: Install and activate. The database tables will be generated automatically.

Configure Settings: Go to Settings > ARWAI Annotator in the WordPress admin menu. Choose your active post types and decide if you want to link Annotorious tags to a WP taxonomy.

Add Images to a Post: Create a new Post. Look for the "Image Collection (sortable)" metabox. Click "Add/Select Images" to choose images from your media library.

View and Annotate: Publish the post and view it on the frontend. Click the "Enlarge" (Maximize) icon on the viewer toolbar to open OpenSeadragon.

Draw: Hold SHIFT and click-and-drag over the image to create a new annotation, add comments, and save.
