-- ============================================================
-- Plane bootstrap for Kineo360
--   - 3 Workspaces (corehub, medtheris, kineo)
--   - ali.peters@kineo.swiss as Owner + Admin in all 3
--   - Long-lived API token for ali for the bridge service
-- ============================================================

\set ON_ERROR_STOP on

DO $$
DECLARE
    v_ali_id uuid;
    v_corehub uuid := '11111111-1111-1111-1111-111111111111';
    v_medtheris uuid := '22222222-2222-2222-2222-222222222222';
    v_kineo uuid := '33333333-3333-3333-3333-333333333333';
BEGIN
    SELECT id INTO v_ali_id FROM users WHERE email = 'ali.peters@kineo.swiss';
    IF v_ali_id IS NULL THEN
        RAISE EXCEPTION 'User ali.peters@kineo.swiss not found in Plane';
    END IF;

    -- 1) Workspaces (idempotent via slug)
    INSERT INTO workspaces (id, name, slug, owner_id, created_by_id, updated_by_id,
                            organization_size, timezone, background_color,
                            created_at, updated_at)
    VALUES
      (v_corehub,   'Corehub',   'corehub',   v_ali_id, v_ali_id, v_ali_id,
       '11-50', 'Europe/Zurich', '#1e4d8c', NOW(), NOW()),
      (v_medtheris, 'MedTheris', 'medtheris', v_ali_id, v_ali_id, v_ali_id,
       '11-50', 'Europe/Zurich', '#059669', NOW(), NOW()),
      (v_kineo,     'Kineo',     'kineo',     v_ali_id, v_ali_id, v_ali_id,
       '11-50', 'Europe/Zurich', '#7c3aed', NOW(), NOW())
    ON CONFLICT (slug) DO NOTHING;

    -- 2) Workspace memberships (role 20 = Admin)
    INSERT INTO workspace_members (id, role, member_id, workspace_id, created_by_id, updated_by_id,
                                   view_props, default_props, issue_props, is_active,
                                   explored_features, getting_started_checklist, tips,
                                   created_at, updated_at)
    SELECT gen_random_uuid(), 20, v_ali_id, w.id, v_ali_id, v_ali_id,
           '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, true,
           '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
           NOW(), NOW()
    FROM workspaces w
    WHERE w.slug IN ('corehub', 'medtheris', 'kineo')
      AND NOT EXISTS (
          SELECT 1 FROM workspace_members wm
          WHERE wm.workspace_id = w.id AND wm.member_id = v_ali_id AND wm.deleted_at IS NULL
      );

    -- 3) Long-lived API token for the SSO bridge (label: "portal-bridge")
    INSERT INTO api_tokens (id, token, label, description, user_type, user_id, is_active, is_service,
                            allowed_rate_limit, created_at, updated_at)
    SELECT gen_random_uuid(),
           'plane_api_' || replace(gen_random_uuid()::text, '-', ''),
           'portal-bridge',
           'Used by Corehub Portal /api/plane/sso bridge to provision users + memberships.',
           1, v_ali_id, true, true, '60/minute', NOW(), NOW()
    WHERE NOT EXISTS (
        SELECT 1 FROM api_tokens WHERE label = 'portal-bridge' AND user_id = v_ali_id AND deleted_at IS NULL
    );
END $$;

-- Diagnostics
SELECT '— workspaces —' AS section;
SELECT id, name, slug, owner_id FROM workspaces ORDER BY slug;
SELECT '— memberships (ali) —' AS section;
SELECT w.slug, wm.role, wm.is_active
  FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id
  WHERE wm.member_id = (SELECT id FROM users WHERE email = 'ali.peters@kineo.swiss')
  ORDER BY w.slug;
SELECT '— api token (portal-bridge) —' AS section;
SELECT label, token, is_active, is_service
  FROM api_tokens WHERE label = 'portal-bridge';
