# docker/playwright.Dockerfile — the version-matched three-engine lane (#253).
#
# Versions are injected by scripts/container-test.mjs from the project's OWN
# pins — never hand-edited here:
#   PLAYWRIGHT_VERSION ← installed @playwright/test (package.json, exact pin);
#     selects the official Playwright Ubuntu image so browser/OS dependencies
#     always match the installed test runner. Tag availability is verified in
#     the registry before any pull.
#   NODE_VERSION ← the repo's Node pin (.mise.toml); copied over the image's
#     Node so the container provably runs the project's Node 22 (verified
#     again inside the running container before every test run).
#
# No privileged containers, no /tmp compatibility libraries, no
# LD_LIBRARY_PATH tricks, no replacement of Omarchy system libraries: the
# Ubuntu userspace inside the image owns all browser dependencies.
ARG PLAYWRIGHT_VERSION
ARG NODE_VERSION
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble
COPY --from=node:${NODE_VERSION}-slim /usr/local/bin/node /usr/local/bin/node
