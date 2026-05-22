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

        $metaboxContainer.on('click', '#arwai-iiif-upload-button', function(e) {
            e.preventDefault();
            var $button = $(this);
            var $input = $('#iiif_image_url');
            var $status = $('#arwai-iiif-status');
            var iiifUrl = $input.val().trim();
            var postId = $('#post_ID').val();

            if (!iiifUrl) {
                alert('Please enter a IIIF URL.');
                return;
            }

            $button.prop('disabled', true).text('Uploading...');
            $status.show().html('<span class="spinner is-active" style="float:none; margin:0 5px 0 0;"></span> Sideloading image...');

            $.post(Arwai_Admin_Data.ajax_url, {
                action: 'arwai_sideload_iiif',
                nonce: Arwai_Admin_Data.sideload_nonce,
                iiif_url: iiifUrl,
                post_id: postId
            }).done(function(response) {
                if (response.success) {
                    var id = response.data.attach_id;
                    var thumbUrl = response.data.thumb_url;

                    var currentIds = $hiddenField.val() ? JSON.parse($hiddenField.val()) : [];
                    if (!Array.isArray(currentIds)) currentIds = [];
                    currentIds.push(id);

                    $imageList.append(createImageLi(id, thumbUrl));
                    updateHiddenField(currentIds);

                    $input.val('');
                    $status.html('<span style="color: green;">✔ Image sideloaded successfully!</span>');
                } else {
                    $status.html('<span style="color: red;">✘ ' + response.data + '</span>');
                }
            }).fail(function() {
                $status.html('<span style="color: red;">✘ An unexpected error occurred.</span>');
            }).always(function() {
                $button.prop('disabled', false).text('Upload');
                setTimeout(function() { $status.fadeOut(); }, 5000);
            });
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
});