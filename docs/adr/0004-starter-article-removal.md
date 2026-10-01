# Respect starter article removal across library transfers

Getting Started with Lem Reader is optional: deleting the starter article keeps it absent across reloads, including when the library is empty. Settings offers an explicit Restore Getting Started action, and a full local-data reset restores the initial library. Old direct links show an unavailable-article message with an explicit restore action instead of silently restoring the article.

Library exports carry the starter article's removal choice. Importing into a fresh installation adopts that choice; importing into an existing library preserves the destination's choice. This makes transfers preserve an intentionally empty library while preventing an imported library from overriding an existing reader's onboarding preference.
