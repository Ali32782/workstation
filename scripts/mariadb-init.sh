#!/bin/bash
# Creates per-tenant databases & users on first MariaDB boot:
#   - nc_corehub / nc_medtheris  → Nextcloud instances
#   - mautic                     → Mautic Marketing Automation (MedTheris)
set -euo pipefail

mysql -uroot -p"${MARIADB_ROOT_PASSWORD}" <<SQL
CREATE DATABASE IF NOT EXISTS nc_corehub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'nc_corehub'@'%' IDENTIFIED BY '${NC_COREHUB_DB_PASSWORD}';
GRANT ALL PRIVILEGES ON nc_corehub.* TO 'nc_corehub'@'%';

CREATE DATABASE IF NOT EXISTS nc_medtheris CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'nc_medtheris'@'%' IDENTIFIED BY '${NC_MEDTHERIS_DB_PASSWORD}';
GRANT ALL PRIVILEGES ON nc_medtheris.* TO 'nc_medtheris'@'%';

CREATE DATABASE IF NOT EXISTS mautic CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'mautic'@'%' IDENTIFIED BY '${MAUTIC_DB_PASSWORD:-CHANGE_ME}';
GRANT ALL PRIVILEGES ON mautic.* TO 'mautic'@'%';

FLUSH PRIVILEGES;
SQL
