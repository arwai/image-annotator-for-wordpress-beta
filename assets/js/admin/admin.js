jQuery(document).ready(function($) {

    // --- Settings Page Logic ---
    // This code only runs on the settings page
    if ($('.arwai-toggle-list').length) {

        // Hide all toggle content by default and set the header to the 'closed' state.
        $('.arwai-toggle-list-content').hide();
        $('.arwai-toggle-list-header').removeClass('open');

        // Logic for the collapsible sections
        $('.arwai-toggle-list .arwai-toggle-list-header').on('click', function() {
            $(this).next('.arwai-toggle-list-content').slideToggle();
            $(this).toggleClass('open');
        });

        // Initialize the color picker
        $('.arwai-color-picker').wpColorPicker();

        // Start with the taxonomy toggle list closed by default.
        $('#field_anno_taxonomy .arwai-toggle-list .arwai-toggle-list-content').hide();
        $('#field_anno_taxonomy .arwai-toggle-list .arwai-toggle-list-header').removeClass('open');
    }


    // --- Metabox Image Uploader Logic ---
    // This code only runs on the post edit screen
    var $metaboxContainer = $('#arwai-multi-image-uploader-container');
    if ($metaboxContainer.length) {
        var $imageList = $metaboxContainer.find('.arwai-multi-image-list');
        var $hiddenField = $metaboxContainer.find('#arwai_multi_image_ids_field');
        var mediaFrame;

        $imageList.sortable({
            placeholder: "arwai-multi-image-placeholder",
            stop: function() {
                updateHiddenField();
            }
        }).disableSelection();

        $metaboxContainer.on('click', '.arwai-multi-image-add-button', function(e) {
            e.preventDefault();

            if (mediaFrame) {
                mediaFrame.open();
                return;
            }

            mediaFrame = wp.media({
                title: 'Select Images for Collection',
                button: { text: 'Use these images' },
                multiple: true
            });

            mediaFrame.on('select', function() {
                var selection = mediaFrame.state().get('selection');
                var currentIds = $hiddenField.val() ? JSON.parse($hiddenField.val()) : [];
                if (!Array.isArray(currentIds)) currentIds = [];

                selection.each(function(attachment) {
                    var id = attachment.id;
                    if ($.inArray(id, currentIds) === -1) {
                        currentIds.push(id);
                        var thumbUrl = attachment.attributes.sizes.thumbnail ? attachment.attributes.sizes.thumbnail.url : attachment.attributes.url;
                        $imageList.append(createImageLi(id, thumbUrl));
                    }
                });
                updateHiddenField(currentIds);
            });

            mediaFrame.open();
        });

        $metaboxContainer.on('click', '.arwai-multi-image-remove', function(e) {
            e.preventDefault();
            var $item = $(this).closest('li');
            var idToRemove = $item.data('id');
            
            var currentIds = $hiddenField.val() ? JSON.parse($hiddenField.val()) : [];
            if (!Array.isArray(currentIds)) currentIds = [];
            
            var newIds = $.grep(currentIds, function(value) {
                return value != idToRemove;
            });

            $item.remove();
            updateHiddenField(newIds);
        });

        function createImageLi(id, thumbUrl) {
            return '<li data-id="' + id + '"><img src="' + thumbUrl + '" style="max-width:100px; max-height:100px; display:block;"/><a href="#" class="arwai-multi-image-remove dashicons dashicons-trash" title="Remove image"></a></li>';
        }

        function updateHiddenField(ids) {
            if (!ids) {
                ids = [];
                $imageList.find('li').each(function() {
                    ids.push($(this).data('id'));
                });
            }
            $hiddenField.val(JSON.stringify(ids)).trigger('change');
        }
    }



    // --- NEW: Snippet Regeneration Logic ---
    const regenButton = $('#arwai-regenerate-snippets-btn');
    const statusContainer = $('#arwai-regeneration-status');
    const nonceField = $('#arwai_regenerate_snippets_nonce_field');

    regenButton.on('click', function() {
        if (!confirm('Are you sure you want to regenerate all annotation snippets? This action cannot be undone. Please ensure you have a database backup.')) {
            return;
        }

        // Provide immediate feedback to the user
        regenButton.prop('disabled', true);
        statusContainer.css('border-left-color', '#0073aa').html('Processing... Please do not close this page. This may take several minutes.').show();

        // Make the AJAX call
        $.ajax({
            url: ajaxurl, // ajaxurl is a global variable defined by WordPress
            type: 'POST',
            data: {
                action: 'arwai_regenerate_snippets',
                nonce: nonceField.val()
            },
            success: function(response) {
                if (response.success) {
                    statusContainer.css('border-left-color', '#46b450').html('<strong>Success!</strong><br>' + response.data.message);
                } else {
                    statusContainer.css('border-left-color', '#dc3232').html('<strong>Error:</strong><br>' + response.data.message);
                }
            },
            error: function(xhr) {
                const errorMsg = xhr.responseText ? xhr.responseText : 'An unknown AJAX error occurred.';
                statusContainer.css('border-left-color', '#dc3232').html('<strong>Critical Error:</strong><br>Could not complete the request. ' + errorMsg);
            },
            complete: function() {
                // Re-enable the button once the process is finished
                regenButton.prop('disabled', false);
            }
        });
    });

        // --- NEW: Snippet Cleanup Logic ---
    const cleanButton = $('#arwai-clean-snippets-btn');
    const cleanStatusContainer = $('#arwai-cleanup-status');
    const cleanNonceField = $('#arwai_clean_snippets_nonce_field');

    cleanButton.on('click', function() {
        if (!confirm('ARE YOU ABSOLUTELY SURE?\n\nThis will permanently delete snippet data from the annotation_data column. This cannot be undone. Only proceed if you have a working database backup.')) {
            return;
        }

        // Provide immediate feedback
        cleanButton.prop('disabled', true);
        cleanStatusContainer.css('border-left-color', '#0073aa').html('Cleaning... Please do not close this page.').show();

        // Make the AJAX call
        $.ajax({
            url: ajaxurl,
            type: 'POST',
            data: {
                action: 'arwai_clean_old_snippets',
                nonce: cleanNonceField.val()
            },
            success: function(response) {
                if (response.success) {
                    cleanStatusContainer.css('border-left-color', '#46b450').html('<strong>Success!</strong><br>' + response.data.message);
                } else {
                    cleanStatusContainer.css('border-left-color', '#dc3232').html('<strong>Error:</strong><br>' + response.data.message);
                }
            },
            error: function() {
                cleanStatusContainer.css('border-left-color', '#dc3232').html('<strong>Critical Error:</strong><br>The cleanup process could not be completed due to a server error.');
            },
            complete: function() {
                // Keep the button disabled after a successful run to prevent re-running
                if (!cleanButton.hasClass('button-success')) {
                     cleanButton.text('Cleanup Complete').addClass('button-success');
                }
            }
        });
    });
    
});