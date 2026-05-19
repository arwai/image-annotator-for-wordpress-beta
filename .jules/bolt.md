## 2025-05-15 - [Implemented Frontend Annotation Cache]
**Learning:** Navigating between multiple annotated images in a gallery was slow because each switch triggered a new AJAX request to the database. Even when returning to a previously viewed image, the data was re-fetched.
**Action:** Implemented a simple frontend `annotationCache` object in `script.js`. This makes image switching instantaneous for already-loaded images. CRITICAL: The cache must be manually synced during create, update, and delete events to ensure it stays current without needing a full refresh.
