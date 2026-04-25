-- ============================================================
-- Uptime Kuma bootstrap for Kineo360 Workstation
--   - Admin user: ali / <Keycloak admin password>
--   - 15 HTTP monitors (60s interval)
--   - Public status page slug: kineo360
-- ============================================================

BEGIN TRANSACTION;

-- 1) Admin user (idempotent)
INSERT OR IGNORE INTO user (id, username, password, active, timezone, twofa_status)
VALUES (1, 'ali', '__BCRYPT__', 1, 'Europe/Zurich', 0);

-- 2) HTTP monitors
INSERT OR IGNORE INTO monitor
  (name, type, url, method, interval, retry_interval, maxretries, active, weight,
   accepted_statuscodes_json, ignore_tls, upside_down, maxredirects, expiry_notification, packet_size, timeout)
VALUES
  ('Portal',        'http', 'https://app.kineo360.work/login',                       'GET', 60, 30, 2, 1, 2000, '["200-299","301","302","307"]', 0, 0, 5, 1, 56, 30),
  ('Keycloak',      'http', 'https://auth.kineo360.work/realms/main/.well-known/openid-configuration', 'GET', 60, 30, 2, 1, 2000, '["200"]', 0, 0, 5, 1, 56, 30),
  ('Mail (Webmail)', 'http', 'https://webmail.kineo360.work/',                       'GET', 60, 30, 2, 1, 2000, '["200-299","301","302"]', 0, 0, 5, 1, 56, 30),
  ('Chat (Corehub)', 'http', 'https://chat.kineo360.work/api/info',                  'GET', 60, 30, 2, 1, 2000, '["200"]', 0, 0, 5, 1, 56, 30),
  ('Chat (MedTheris)','http', 'https://chat.medtheris.kineo360.work/api/info',       'GET', 60, 30, 2, 1, 2000, '["200"]', 0, 0, 5, 1, 56, 30),
  ('Files (Corehub)', 'http', 'https://files.kineo360.work/status.php',              'GET', 60, 30, 2, 1, 2000, '["200"]', 0, 0, 5, 1, 56, 30),
  ('Files (MedTheris)','http', 'https://files.medtheris.kineo360.work/status.php',   'GET', 60, 30, 2, 1, 2000, '["200"]', 0, 0, 5, 1, 56, 30),
  ('CRM (Twenty)',  'http', 'https://crm.kineo360.work/healthz',                     'GET', 60, 30, 2, 1, 2000, '["200","404"]', 0, 0, 5, 1, 56, 30),
  ('Code (Gitea)',  'http', 'https://git.kineo360.work/api/v1/version',              'GET', 60, 30, 2, 1, 2000, '["200"]', 0, 0, 5, 1, 56, 30),
  ('Plane',         'http', 'https://plane.kineo360.work/',                          'GET', 60, 30, 2, 1, 2000, '["200-299","301","302"]', 0, 0, 5, 1, 56, 30),
  ('Sign (Documenso)', 'http', 'https://sign.kineo360.work/signin',                  'GET', 60, 30, 2, 1, 2000, '["200-299","301","302","307"]', 0, 0, 5, 1, 56, 30),
  ('Calls (Jitsi)', 'http', 'https://meet.kineo360.work/',                           'GET', 60, 30, 2, 1, 2000, '["200-299"]', 0, 0, 5, 1, 56, 30),
  ('Helpdesk (Zammad)', 'http', 'https://support.medtheris.kineo360.work/',          'GET', 120, 30, 2, 1, 2000, '["200-299","301","302"]', 0, 0, 5, 1, 56, 30),
  ('Reverse Proxy', 'http', 'https://kineo360.work/',                                'GET', 120, 30, 2, 1, 2000, '["200-299","301","302","404"]', 0, 0, 5, 1, 56, 30),
  ('Status Page (self)', 'http', 'https://status.medtheris.kineo360.work/',          'GET', 300, 30, 2, 1, 2000, '["200-299","301","302"]', 0, 0, 5, 1, 56, 30);

-- 3) Public status page
INSERT OR IGNORE INTO status_page
  (id, slug, title, description, icon, theme, published, search_engine_index, show_tags, show_powered_by, show_certificate_expiry)
VALUES
  (1, 'kineo360', 'Kineo360 Workstation', 'Live-Status aller Self-hosted Services für Corehub · MedTheris · Kineo.', '/icon.svg', 'auto', 1, 0, 0, 1, 1);

-- 4) Group "Services" tied to that status page, with all monitors attached
INSERT OR IGNORE INTO `group` (id, name, public, active, weight, status_page_id)
VALUES (1, 'Services', 1, 1, 1000, 1);

INSERT OR IGNORE INTO monitor_group (monitor_id, group_id, weight, send_url)
SELECT m.id, 1, m.id * 10, 0
FROM monitor m
WHERE NOT EXISTS (
  SELECT 1 FROM monitor_group mg WHERE mg.monitor_id = m.id AND mg.group_id = 1
);

COMMIT;

-- Diagnostic output
SELECT '— users —' AS section;
SELECT id, username, active FROM user;
SELECT '— monitors —' AS section;
SELECT id, name, type, active FROM monitor ORDER BY id;
SELECT '— status pages —' AS section;
SELECT id, slug, title, published FROM status_page;
SELECT '— groups —' AS section;
SELECT id, name, status_page_id FROM `group`;
SELECT '— monitor_group links —' AS section;
SELECT COUNT(*) AS link_count FROM monitor_group;
