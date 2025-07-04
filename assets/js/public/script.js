// DEBUG: This log should appear as soon as the file is loaded by the browser.
console.log('File loaded: script.js');

/**
 * A formatter to display the annotation ID label.
 */
const arwaiIdFormatter = function(annotation) {
  // DEBUG: This log confirms that Annotorious is calling the formatter for annotationid
//   console.log('arwaiIdFormatter was called for annotation:', annotation);

  const idBody = annotation.body.find(b => b.purpose === 'arwai-AnnotationID');
  if (idBody) {
    const foreignObject = document.createElementNS('http://www.w3.org/2000/svg','foreignObject');

        foreignObject.innerHTML =
        `<label xmlns="http://www.w3.org/1999/xhtml" >${idBody.value}</label>`;
    return {
      element: foreignObject
    };
  }
  return null;
}

/**
 * A single, combined formatter to handle annotation styling.
 */
const arwaiStyleFormatter = function(annotation) {
    // DEBUG: Log to confirm the style formatter is running.
    // console.log('arwaiStyleFormatter was called.');

    const isImportant = annotation.body.find(b =>
        b.purpose === 'tagging' && (b.value.toLowerCase() === 'important' || b.value.toLowerCase() === 'importante')
    );
    if (isImportant) return { className: 'important' };

    const hasTags = annotation.body.find(b => b.purpose === 'tagging');
    if (hasTags) return { className: 'tagged' };

    return null;
};


jQuery(document).ready(function($) {
    console.log('Document ready. Starting viewer initialization.');

    if (typeof Arwai_Annotator_Data === 'undefined') {
        console.error('Arwai_Annotator_Data is not defined.');
        return;
    }

    // --- 1. GLOBAL VARIABLES & SELECTORS ---
    const { containerId, images, ajax_url, anno_options } = Arwai_Annotator_Data;
    const container = $('#' + containerId);
    if (!container.length || images.length === 0) return;



    // Simple Viewer elements
    // const mainImage = container.find('.arwai-simple-viewer-main img');
    const prevButton = container.find('.arwai-simple-prev');
    const nextButton = container.find('.arwai-simple-next');
    const thumbnails = container.find('.arwai-simple-thumb');
    const currentIndexSpan = container.find('.arwai-simple-current-index');
    const strip = container.find('#arwai-simple-viewer-reference-strip');
    const scrollLeftButton = container.find('.arwai-simple-strip-scroll-left');
    const scrollRightButton = container.find('.arwai-simple-strip-scroll-right');
    const slideNav = container.find('.arwai-simple-viewer-nav');

    const slickSlider = container.find('.arwai-slick-slider'); // New selector for Slick
    let mainImage; // This will be redefined on slide change
    
    // Shared / OSD elements
    const listContainer = $('#arwai-annotation-list');
    const listContainerWrapper = $('#arwai-simple-annotation-list'); // <-- ADD THIS LINE
    const toggleButton = $('#arwai-toggle-annotations');
    
    const launchOsdButton = $('#arwai-launch-osd');
    const osdModal = $('#arwai-osd-modal');
    const osdCloseButton = $('#arwai-osd-close');
    const osdToggleButton = $('#arwai-toggle-annotations-osd'); // <-- ADD THIS LINE


    // --- SELECTORS FOR THE SINGLE ANNOTATION DISPLAY ---
    const singleAnnotationContainer = $('#arwai-single-annotation-container');
    const singleAnnotationList = $('#arwai-single-annotation');

    // const singleAnnotationListContainer = $('#arwai-annotation-list');


    // --- 2. STATE MANAGEMENT ---
    let currentIndex = 0;
    let simpleAnno = null; // Annotorious instance for the simple viewer
    let osdViewer = null;  // OpenSeadragon viewer instance
    let osdAnno = null;    // Annotorious instance for OSD
    let annotationsVisible = false;
    // let annotationsLoaded = {}; 
    let highlightedAnnotation = null; 


    // --- 3. SHARED & HELPER FUNCTIONS ---

    // // Converts a W3C percent annotation to a pixel-based one for the simple viewer
    // function convertAnnotationToPixel(annotation, imageWidth, imageHeight) {
    //     const newA = JSON.parse(JSON.stringify(annotation));
    //     if (newA.target.selector.value && newA.target.selector.value.startsWith('xywh=percent:')) {
    //         const coords = newA.target.selector.value.substring(13).split(',');
    //         const percent = { x: parseFloat(coords[0]), y: parseFloat(coords[1]), w: parseFloat(coords[2]), h: parseFloat(coords[3]) };
    //         const px = { x: (percent.x / 100) * imageWidth, y: (percent.y / 100) * imageHeight, w: (percent.w / 100) * imageWidth, h: (percent.h / 100) * imageHeight };
    //         newA.target.selector.value = `xywh=pixel:${px.x},${px.y},${px.w},${px.h}`;
    //     }
    //     return newA;
    // }

    // // Converts a pixel-based annotation from the simple viewer to a W3C percent-based one for saving
    // function convertAnnotationToPercent(annotation, imageWidth, imageHeight) {
    //     const newA = JSON.parse(JSON.stringify(annotation));
    //      if (newA.target.selector.value && newA.target.selector.value.startsWith('xywh=pixel:')) {
    //         const coords = newA.target.selector.value.substring(11).split(',');
    //         const px = { x: parseFloat(coords[0]), y: parseFloat(coords[1]), w: parseFloat(coords[2]), h: parseFloat(coords[3]) };
    //         const percent = { x: (px.x / imageWidth) * 100, y: (px.y / imageHeight) * 100, w: (px.w / imageWidth) * 100, h: (px.h / imageHeight) * 100 };
    //         newA.target.selector.value = `xywh=percent:${percent.x},${percent.y},${percent.w},${percent.h}`;
    //     }
    //     return newA;
    // }

    // Generic function to load annotations from the server into ANY Annotorious instance
    function loadAnnotations(attachmentId, annoInstance) {
        if (!annoInstance || !attachmentId) return;
        annoInstance.clearAnnotations();
        updateAnnotationList(annoInstance);

        $.ajax({
            url: ajax_url,
            data: { action: 'arwai_anno_get', attachment_id: attachmentId },
            dataType: 'json',
            success: function(annotations) {
                if (Array.isArray(annotations)) {
                    // The W3C adapter now handles all loading automatically
                    annoInstance.setAnnotations(annotations);
                    updateAnnotationList(annoInstance);
                }
            }
        });
    }

    // Generic function to update the sidebar list from ANY Annotorious instance
    function updateAnnotationList(annoInstance) {
        if (!listContainer.length || !annoInstance) return;
        listContainer.empty();
        const annotations = annoInstance.getAnnotations();
        if (annotations.length === 0) {
            listContainer.html('<li style="background:transparent;">No annotations for this image.</li>');
            return;
        }
        const tagLinks = anno_options.tagLinks || {};
        annotations.forEach(annotation => {
            const idBody = annotation.body.find(b => b.purpose === 'arwai-AnnotationID');
            const annotationId = idBody ? idBody.value : 'N/A';
            const tagBodies = annotation.body.filter(b => b.purpose === 'tagging');
            const tagsHtml = tagBodies.length > 0 ? tagBodies.map(body => {
            const tagName = body.value;
            return tagLinks[tagName] ? `<button class="arwai-anno-list-tag"><a href="${tagLinks[tagName]}" class="arwai-anno-list-tag-link">${tagName}</a></button>` : `<span class="arwai-anno-list-tag">${tagName}</span>`;
            }).join(' ') : '<em>n/a</em>';
            const commentBodies = annotation.body.filter(b => b.purpose === 'commenting' || b.purpose === 'replying');
            let commentsHtml = '<p class="arwai-empty-comment"><em>Empty comment</em></p>';
            if (commentBodies.length > 0) {
            commentsHtml = '<ul class="arwai-anno-list-comments">';
            commentBodies.forEach(body => {
                const creator = body.creator || annotation.creator;
                const creatorName = creator ? (creator.name || creator.displayName) : 'Unknown';
                const dateValue = body.created || annotation.created;
                let createdDate = 'N/A';
                if (dateValue) {
                const dateObj = new Date(dateValue);
                // Format: "25 Mar 2015" and "14:05"
                const datePart = dateObj.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
                const timePart = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
                createdDate = `${datePart}  (${timePart})`;
                }
                const commentText = body.value || '<em>Empty comment</em>';
                commentsHtml += `
                <li class="arwai-anno-list-comment-item">
                    <p>${commentText}</p>
                    <div class="arwai-anno-list-comment-meta">
                    ${creatorName}: 
                    ${createdDate}
                    </div>
                </li>`;
            });
            commentsHtml += '</ul>';
            }
            const listItem = `
        <li data-id="${annotationId}">
            <div class="arwai-anno-list-item">
                <div class="arwai-anno-list-header"><span> ${annotationId}</span>
                </div>
                <div>
                    <div class="arwai-anno-list-body">${commentsHtml}
                    </div>
                    <div class="arwai-anno-list-footer"><strong>Tags:</strong> ${tagsHtml}
                    </div>
                </div>
            </div>
        </li>`;
        listContainer.append(listItem);
        });
    }

    // ### SINGLE ANNOTATION DISPLAY ###
    function updateSingleAnnotationDisplay(annotation) {
        if (!singleAnnotationContainer.length) return; // Do nothing if the shortcode isn't on the page

        // If no annotation is selected (or deselected), hide and clear it.
        if (!annotation) {
            singleAnnotationContainer.hide();
            singleAnnotationList.empty();
            return;
        }

        // --- Get annotation data (similar to the main list) ---
        const idBody = annotation.body.find(b => b.purpose === 'arwai-AnnotationID');
        const annotationId = idBody ? idBody.value : 'N/A';
        const tagBodies = annotation.body.filter(b => b.purpose === 'tagging');

    // 1. Get the tagLinks object, just like in your other function.
    const tagLinks = anno_options.tagLinks || {};

    // 2. Use the same logic to generate linked tags.
    const tagsHtml = tagBodies.length > 0 ? tagBodies.map(body => {
        const tagName = body.value;
        return tagLinks[tagName] 
            ? `<button class="arwai-anno-list-tag"><a href="${tagLinks[tagName]}" class="arwai-anno-list-tag-link">${tagName}</a></button>` 
            : `<span class="arwai-anno-list-tag">${tagName}</span>`;
    }).join(' ') : '<em>n/a</em>';


        const commentBodies = annotation.body.filter(b => b.purpose === 'commenting' || b.purpose === 'replying');
        let commentsHtml = '<p><em>No comments.</em></p>';
        if (commentBodies.length > 0) {
            commentsHtml = '<ul>' + commentBodies.map(body => {
                const creatorName = body.creator ? (body.creator.name || body.creator.displayName) : 'Unknown';
                return `<li><p>${body.value}</p><small>By: ${creatorName}</small></li>`;
            }).join('') + `</ul>`;
        }
        const newHtml = `
            <li>
                <div class="arwai-anno-list-header-single">
                    <span>${annotationId}
                    </span>
                </div>
                <div class="arwai-anno-list-body">${commentsHtml}</div>
                <div class="arwai-anno-list-footer"><strong>Tags:</strong> ${tagsHtml}</div>
                <span>
                    <button id="arwai-close-single-annotation" class="arwai-btn" title="Close">
                        <i data-feather="x"></i>    
                    </button>
                </span>  

            </li>
          
            `;
        singleAnnotationList.html(newHtml);

        // Call feather.replace() to render the new icon
        if (typeof feather !== 'undefined') {
            feather.replace();
        }

        // --- Sync the Border Color ---
        const style = arwaiStyleFormatter(annotation);

        singleAnnotationContainer.removeClass(function(index, className) {
            return (className.match(/\bis-[^\s]+/g) || []).join(' ');
        });

        if (style && style.className) {
            // Apply the class to both containers
            singleAnnotationContainer.addClass('is-' + style.className);
            listContainer.addClass('is-' + style.className);
        }
        //


        // Only show if screen width is less than 777px
        if (window.innerWidth < 767) {
            singleAnnotationContainer.css('display', 'block');
        } else {
            singleAnnotationContainer.hide();
        }

    }

    // Generic function to attach saving/deleting event handlers to ANY Annotorious instance
    function attachEventHandlers(annoInstance) {
         annoInstance.on('createAnnotation', function(annotation) {
            // The annotation is already in the correct W3C percent format
            $.post(ajax_url, { action: 'arwai_anno_add', annotation: JSON.stringify(annotation) })
                .done(function(response) {
                    if (response.success && response.data.annotation) {
                        annoInstance.removeAnnotation(annotation);
                        annoInstance.addAnnotation(response.data.annotation);
                        updateAnnotationList(annoInstance);
                    }
                });
        });

        annoInstance.on('updateAnnotation', function(annotation) {
            $.post(ajax_url, { action: 'arwai_anno_update', annotation: JSON.stringify(annotation), annotationid: annotation.id });
            updateAnnotationList(annoInstance);
        });

        annoInstance.on('deleteAnnotation', function(annotation) {
            $.post(ajax_url, { action: 'arwai_anno_delete', annotation: JSON.stringify(annotation), annotationid: annotation.id });
            updateAnnotationList(annoInstance);
        });

        annoInstance.on('selectAnnotation', function(annotation, element) {
            if (highlightedAnnotation) {
                highlightedAnnotation.classList.remove('is-highlighted');
            }
            element.classList.add('is-highlighted');
            highlightedAnnotation = element;
            updateSingleAnnotationDisplay(annotation);

            // --- SYNC TO LIST ---
            // 1. Remove highlight from any previously selected list item
            listContainer.find('li.is-highlighted').removeClass('is-highlighted');

            // 2. Find the new list item by its data-id and highlight it
            const idBody = annotation.body.find(b => b.purpose === 'arwai-AnnotationID');
            if (idBody) {
                listContainer.find(`li[data-id="${idBody.value}"]`).addClass('is-highlighted');
            }
        });

        annoInstance.on('cancelSelected', function() {
            if (highlightedAnnotation) {
                highlightedAnnotation.classList.remove('is-highlighted');
                highlightedAnnotation = null;
            }
            updateSingleAnnotationDisplay(null);
            // Remove highlight from list
            listContainer.find('li.is-highlighted').fadeOut(150, function() {
            $(this).removeClass('is-highlighted').show();
            });
            
        });
    }

    $(document).off('click', '#arwai-close-single-annotation').on('click', '#arwai-close-single-annotation', function() {
        const activeAnno = osdViewer ? osdAnno : simpleAnno;

        if (activeAnno?.cancelSelected) {
            activeAnno.cancelSelected();
        }

        // Optional: hide the container manually
        singleAnnotationContainer.hide();
        singleAnnotationList.empty();
    });

    
    // --- 4. SIMPLE VIEWER LOGIC ---
    // A more robust initializer for the simple viewer
    function initSimpleAnnotorious() {
        if (simpleAnno) {
            simpleAnno.destroy();
            simpleAnno = null;
            highlightedAnnotation = null;
        }

            // If Slick is running, find the current slide's image.
        // Otherwise, just find the first (and only) image in the container.
        if (slickSlider.hasClass('slick-initialized')) {
            mainImage = slickSlider.find('.slick-current img');
        } else {
            mainImage = slickSlider.find('img').first();
        }

        
        // mainImage = slickSlider.find('.slick-current img');
        if (!mainImage.length) return;

        const annoConfig = {
            image: mainImage[0],
            formatters: [arwaiIdFormatter, arwaiStyleFormatter],
            fragmentUnit: 'percent',
            adapter: Annotorious.W3CImageAdapter,
            readOnly: true, //anno_options.readOnly || !anno_options.currentUser,
            disableEditor: true,
            allowEmpty: anno_options.allowEmpty,
            drawOnSingleClick: anno_options.drawOnSingleClick,
            widgets: [
                'COMMENT',
                { widget: 'TAG', vocabulary: anno_options.tagVocabulary || [] }
            ],
            // The messages object can remain as is
            messages: {
            "Add a comment...": "Add a comment...",
            "Add a reply...": "Add a reply...",
            "Add tag...": "Add tag or name...",
            "Cancel": "Cancel",
            "Close": "Close",
            "Edit": "Edit",
            "Delete": "Delete",
            "Ok": "Ok"
            }
        };

        simpleAnno = Annotorious.init(annoConfig);

        if (anno_options.currentUser) {
            simpleAnno.setAuthInfo({ id: anno_options.currentUser.id, displayName: anno_options.currentUser.displayName });
        }

        attachEventHandlers(simpleAnno, mainImage[0]);
        
        // If annotations are supposed to be visible globally, load them into this new instance.
        // This ensures that when we close OSD or change slides, the state is correct.
        if (annotationsVisible) {
            const currentAttachmentId = mainImage.data('attachment-id');
            if (currentAttachmentId) {
                loadAnnotations(currentAttachmentId, simpleAnno);
            }
        }

        // Always sync the instance's visibility with the global state.
        simpleAnno.setVisible(annotationsVisible);
    }


    // --- 5. OPENSEADRAGON (DEEP ZOOM) LOGIC ---
    function launchOsdViewer() {
        // Show the modal container first
        osdModal.show();
        
        // Destroy the simple viewer instance to avoid conflicts
        if (simpleAnno) {
            simpleAnno.destroy();
            simpleAnno = null;
        }

        if (typeof feather !== 'undefined') {
            feather.replace();
        }

        // Use a setTimeout to ensure the container is visible before initializing
        setTimeout(function() {
            const osdTileSources = images.map(img => ({
                type: 'image',
                url: img.fullUrl
            }));

            osdViewer = OpenSeadragon({
                id: 'arwai-osd-viewer',
                showNavigator: false,
                gestureSettingsMouse: { clickToZoom: false },
                tileSources: osdTileSources,
                initialPage: currentIndex,
                sequenceMode: true,
                showRotationControl: true,
                toolbar: 'arwai-openseadragon-toolbar',
                zoomInButton:   'arwaiZoomIn',
                zoomOutButton:  'arwaiZoomOut',
                homeButton:     'arwaiHome',
                nextButton:     'arwaiNext',
                previousButton: 'arwaiPrevious',
                rotateLeftButton:  'arwaiRotateLeft',
                rotateRightButton: 'arwaiRotateRight',
                fullPageButton: 'arwaiFullpage',
            });

            osdViewer.addHandler('open', function() {
                osdAnno = OpenSeadragon.Annotorious(osdViewer, {
                    adapter: Annotorious.W3CImageAdapter,
                    fragmentUnit: 'percent',
                    formatters: [arwaiIdFormatter, arwaiStyleFormatter],
                    readOnly: anno_options.readOnly || !anno_options.currentUser,
                    allowEmpty: anno_options.allowEmpty,
                    widgets: ['COMMENT', { widget: 'TAG', vocabulary: anno_options.tagVocabulary || [] }]
                });

                if (anno_options.currentUser) {
                    osdAnno.setAuthInfo({ id: anno_options.currentUser.id, displayName: anno_options.currentUser.displayName });
                }

                attachEventHandlers(osdAnno);

                // Sync the OSD instance's visibility and its toggle button.
                osdAnno.setVisible(annotationsVisible);
                updateToggleUI(annotationsVisible);
            });

            // THIS IS THE CORRECTED 'page' EVENT HANDLER
            osdViewer.addHandler('page', function(event) {
                currentIndex = event.page;
                const attachmentId = images[currentIndex].post_id;

                // 1. Always clear existing annotations and the list first.
                if (osdAnno) {
                    osdAnno.clearAnnotations();
                    updateAnnotationList(osdAnno); // This will show "No annotations..."
                }

                // 2. If annotations are toggled on, fetch the new ones.
                if (annotationsVisible && osdAnno) {
                    $.ajax({
                        url: ajax_url,
                        data: { action: 'arwai_anno_get', attachment_id: attachmentId },
                        dataType: 'json',
                        success: function(annotations) {
                            if (Array.isArray(annotations)) {
                                osdAnno.setAnnotations(annotations);
                                updateAnnotationList(osdAnno);
                            }
                        }
                    });
                }
            });

            osdViewer.addHandler('rotate', function(event) {
                const { degrees } = event;
                const labels = document.querySelectorAll('#arwai-osd-viewer .a9s-annotation foreignObject');
                labels.forEach(label => {
                    const existingTransform = label.style.transform.replace(/rotate\([^)]+\)/, '').trim();
                    label.style.transform = `${existingTransform} rotate(${-degrees}deg)`;
                });
            });

        }, 30);
    }

    function closeOsdViewer() {
        if (osdViewer) {
            // Get the correct page before destroying
            const lastOsdPage = osdViewer.currentPage();
            currentIndex = lastOsdPage; // Update global index
            osdViewer.destroy();
            osdViewer = null;
            osdAnno = null;
        }
        osdModal.hide();
        updateView(currentIndex); // Relaunch the simple viewer on the correct image

        // --- THIS IS THE FIX ---
        // After closing the modal, we re-initialize the simple viewer and
        // immediately reload its annotations if they were supposed to be visible.
        setTimeout(() => {
            initSimpleAnnotorious(); // This creates a new, empty simpleAnno instance.

            // If annotations were visible before, reload them into the new instance.
            if (annotationsVisible && simpleAnno) {
                const currentAttachmentId = slickSlider.find('.slick-current img').data('attachment-id');
                if (currentAttachmentId) {
                    console.log('Restoring annotations to simple viewer...');
                    loadAnnotations(currentAttachmentId, simpleAnno);
                }
            }
        }, 50); // A small delay ensures the viewer is ready.
    }


    // --- 6. EVENT BINDING & INITIALIZATION ---

    // Helper function to change the main slide (only used in slider mode)
    function updateView(index) {
        if (singleAnnotationContainer.length) singleAnnotationContainer.hide();
        if (index < 0 || index >= images.length) return;
        
        // This line was missing from your code
        slickSlider.slick('slickGoTo', index); 
    }

    // Helper function to show/hide thumbnail strip scroll arrows
    function updateArrowVisibility() {
        if (!strip.length || !scrollLeftButton.length || !scrollRightButton.length) return;
        const canScroll = strip[0].scrollWidth > strip[0].clientWidth;
        scrollLeftButton.toggle(canScroll);
        scrollRightButton.toggle(canScroll);
    }


    // --- Main Initialization Logic ---
    // Check the number of images to decide which mode to use.
    if (images.length > 1) {

        // --- SLIDER MODE (for multiple images) ---
        // Initialize Slick Slider
        slickSlider.slick({
            dots: false,
            arrows: false,
            infinite: true,
            speed: 300,
            slidesToShow: 1,
            adaptiveHeight: true,
            swipeToSlide: true,
            touchThreshold: 7
        });

        // Event handler for AFTER a slide changes
        slickSlider.on('afterChange', function(event, slick, newIndex) {
            currentIndex = newIndex;
            currentIndexSpan.text(currentIndex + 1);
            thumbnails.removeClass('active').eq(currentIndex).addClass('active');
            if (singleAnnotationContainer.length) singleAnnotationContainer.hide();
            initSimpleAnnotorious(); // Re-init Annotorious on the new slide
        });

        // Make buttons control the slider
        prevButton.on('click', () => slickSlider.slick('slickPrev'));
        nextButton.on('click', () => slickSlider.slick('slickNext'));
        
        // Make thumbnails control the slider
        strip.on('click', '.arwai-simple-thumb', function() {
            const newIndex = $(this).data('index');
            slickSlider.slick('slickGoTo', newIndex);
        });
        
        // Make the left/right scroll buttons control the strip
        scrollLeftButton.on('click', function() {
            strip.animate({ scrollLeft: '-=200' }, 300);
        });

        scrollRightButton.on('click', function() {
            strip.animate({ scrollLeft: '+=200' }, 300);
        });

        // Initial setup for slider view
        updateArrowVisibility();
        $(window).on('resize', updateArrowVisibility);
        updateView(0); // Set the initial slide and load Annotorious

        } else {

            // --- SINGLE IMAGE MODE ---

            // Hide slider-specific controls since they are not needed
            prevButton.hide();
            nextButton.hide();
            strip.hide(); // Hides the entire reference strip
            scrollLeftButton.hide();
            scrollRightButton.hide();
            currentIndexSpan.parent().hide(); // Hides the "1 / 1" counter
            slideNav.hide();

            // Initialize Annotorious directly on the single image
            initSimpleAnnotorious();
        }


        singleAnnotationContainer.on('click', '#arwai-close-single-annotation', function() {
            // Find out which viewer is active
            const activeAnno = osdViewer ? osdAnno : simpleAnno;
            
            // Tell the active viewer to cancel the selection
            if (activeAnno && typeof activeAnno.cancelSelected === 'function') {
                activeAnno.cancelSelected();
            }
        }
    );



    // --- SHARED EVENT HANDLERS (Used in BOTH modes) ---

    // Click handler for the annotation list items
    listContainer.on('click', 'li[data-id]', function() {
        const clickedId = $(this).data('id').toString();
        if (!simpleAnno) return;

        const annotationToSelect = simpleAnno.getAnnotations().find(anno => {
            const idBody = anno.body.find(b => b.purpose === 'arwai-AnnotationID');
            return idBody && idBody.value === clickedId;
        });

        if (annotationToSelect) {
            simpleAnno.selectAnnotation(annotationToSelect);
        }
    });

    // The shared click handler for toggling annotation visibility
    function handleAnnotationToggle() {
        annotationsVisible = !annotationsVisible;
        if (listContainerWrapper.length) listContainerWrapper.toggle(annotationsVisible);

        const activeAnno = osdViewer ? osdAnno : simpleAnno;
        if (!activeAnno) return;

        if (annotationsVisible && activeAnno.getAnnotations().length === 0) {
            let currentAttachmentId;
            if (osdViewer) {
                currentAttachmentId = images[currentIndex].post_id;
            } else if (mainImage && mainImage.length) {
                currentAttachmentId = mainImage.data('attachment-id');
            }
            if (currentAttachmentId) {
                loadAnnotations(currentAttachmentId, activeAnno);
            }
        }

        activeAnno.setVisible(annotationsVisible);
        updateToggleUI(annotationsVisible);
    }


    // This helper function now updates BOTH buttons at the same time
    function updateToggleUI(isVisible) {
        const buttons = $('#arwai-toggle-annotations, #arwai-toggle-annotations-osd');

        buttons.find('.feather-eye').toggle(!isVisible);
        buttons.find('.feather-eye-off').toggle(isVisible);

        buttons.find('.feather-eye-label').toggle(!isVisible);
        buttons.find('.feather-eye-off-label').toggle(!isVisible);

        
        buttons.attr('title', isVisible ? 'Hide Annotations' : 'Show Annotations');
    }

    
    // Bind the new shared handler to both buttons
    toggleButton.on('click', handleAnnotationToggle);
    osdToggleButton.on('click', handleAnnotationToggle);

    // --- 7. OSD VIEWER LAUNCH & CLOSE ---
    launchOsdButton.on('click', launchOsdViewer);
    osdCloseButton.on('click', closeOsdViewer);

    // Initial load and setup
    updateView(0);
    //initialize reference strip arrows visibility function
    updateArrowVisibility();
      $(window).on('resize', updateArrowVisibility);
      
    //   inititalize feather icons
    if (typeof feather !== 'undefined') {
        feather.replace();
    }
});