#
# AthenaPhone - Open Source SIP Softphone
#
# Copyright (C) 2026 Tom Cully <mail@tomcully.com>
# Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
#

# Ubuntu 24.04 ships Asterisk 20 LTS (1:20.6.0), which is what this config
# targets. Built from the distribution package rather than a third-party image
# so the version is predictable and the build does not depend on someone
# else's tagging.
#
# Not Debian: Asterisk was removed from bookworm over unfixed CVEs, and only
# the sound-file packages remain there.
FROM ubuntu:24.04

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      asterisk \
      asterisk-core-sounds-en-gsm \
      asterisk-moh-opsound-gsm \
      openssl \
      ca-certificates \
      gettext-base \
 && rm -rf /var/lib/apt/lists/*

# Config is mounted at run time (see docker-compose.yml) so it can be edited
# without rebuilding. The entrypoint renders pjsip.conf from its template.
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

EXPOSE 5060/udp 5060/tcp 5061/tcp 8088/tcp 8089/tcp

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Foreground, verbose, logging to stdout so `docker compose logs` is useful.
CMD ["asterisk", "-f", "-vvv", "-p"]
