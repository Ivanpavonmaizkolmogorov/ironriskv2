"""Check if the admin user has ea_disconnect_minutes alert configured."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))

from models.database import SessionLocal
from models.user import User
from models.user_alerts import UserAlertConfig

with SessionLocal() as db:
    admin = db.query(User).filter(User.is_admin == True).first()
    if not admin:
        print("❌ No admin user found")
        sys.exit(1)
    
    print(f"👤 Admin: {admin.email} (id={admin.id})")
    print(f"   login_count: {admin.login_count}, last_login: {admin.last_login_at}")
    print()
    
    configs = db.query(UserAlertConfig).filter(
        UserAlertConfig.user_id == admin.id
    ).all()
    
    if not configs:
        print("⚠️  NO alert configs found for admin user!")
        print("   The ea_disconnect Telegram alert will NOT fire.")
    else:
        print(f"📋 Found {len(configs)} alert config(s):")
        disconnect_found = False
        for c in configs:
            marker = "🔴" if c.metric_key == "ea_disconnect_minutes" else "  "
            print(f"   {marker} [{c.target_type}] metric={c.metric_key} op={c.operator} threshold={c.threshold_value} channel={c.channel} active={c.is_active} cooldown={c.cooldown_minutes}min")
            if c.metric_key == "ea_disconnect_minutes":
                disconnect_found = True
        
        print()
        if disconnect_found:
            print("✅ ea_disconnect_minutes IS configured — Telegram alert WILL fire")
        else:
            print("⚠️  ea_disconnect_minutes NOT found — Telegram alert will NOT fire")
