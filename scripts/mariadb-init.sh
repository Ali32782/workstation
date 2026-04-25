#!/bin/bash
# Creates per-tenant Nextcloud databases & users on first MariaDB boot.
set -euo pipefail

mysql -uroot -p"${MARIADB_ROOT_PASSWORD}" <<SQL
CREATE DATABASE IF NOT EXISTS nc_corehub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'nc_corehub'@'%' IDENTIFIED BY '${NC_COREHUB_DB_PASSWORD}';
GRANT ALL PRIVILEGES ON nc_corehub.* TO 'nc_corehub'@'%';

CREATE DATABASE IF NOT EXISTS nc_medtheris CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'nc_medtheris'@'%' IDENTIFIED BY '${NC_MEDTHERIS_DB_PASSWORD}';
GRANT ALL PRIVILEGES ON nc_medtheris.* TO 'nc_medtheris'@'%';

FLUSH PRIVILEGES;
SQL
