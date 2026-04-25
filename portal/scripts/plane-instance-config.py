"""Plane instance bootstrap: SMTP via Migadu, Magic Link login,
disable public sign-up + workspace creation.

Run: docker exec -i plane-api-1 python manage.py shell < this-file
"""
from plane.license.models import InstanceConfiguration as IC
from plane.license.utils.encryption import encrypt_data

cfg = {
    "ENABLE_SMTP":                ("1",                                                   False),
    "EMAIL_HOST":                 ("smtp.migadu.com",                                     False),
    "EMAIL_PORT":                 ("465",                                                 False),
    "EMAIL_HOST_USER":            ("johannes@medtheris.kineo360.work",                    False),
    "EMAIL_HOST_PASSWORD":        ("AlDNNZicTYBJHKg2biQv",                                True),
    "EMAIL_FROM":                 ("Kineo360 Plane <johannes@medtheris.kineo360.work>",   False),
    "EMAIL_USE_TLS":              ("0",                                                   False),
    "EMAIL_USE_SSL":              ("1",                                                   False),
    "ENABLE_MAGIC_LINK_LOGIN":    ("1",                                                   False),
    "ENABLE_SIGNUP":              ("0",                                                   False),
    "DISABLE_WORKSPACE_CREATION": ("1",                                                   False),
}

print("Configuring Plane instance...")
for key, (val, enc) in cfg.items():
    obj, created = IC.objects.get_or_create(key=key)
    obj.value = encrypt_data(val) if enc else val
    obj.is_encrypted = enc
    obj.save()
    label = "<encrypted>" if enc else val
    state = "created" if created else "updated"
    print(f"  {key:30s} = {label:55s} ({state})")
print("Done.")
