"""consolidated: briefing columns + bt_discount=1 + clear bayes caches

This single migration replaces the broken chain:
  e74db5cda078 (pass) → a5c3f3c810ae (bt_discount) → 51390179ad16 (broken ??) → ec5182343cb4 (catch-all)

Production DB is stuck at a5c3f3c810ae. This migration continues from there
and performs all pending operations.

Revision ID: f001_consolidated
"""
from alembic import op
import sqlalchemy as sa

revision = 'f001_consolidated'
down_revision = ('8b58e34200b4', 'a1b2c3d4e5f6')
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # 1. Add briefing columns to user_preferences (if missing)
    existing = [c["name"] for c in inspector.get_columns("user_preferences")]
    if "briefing_hour_utc" not in existing:
        op.add_column("user_preferences", sa.Column("briefing_hour_utc", sa.Integer(), nullable=False, server_default="6"))
    if "last_briefing_date" not in existing:
        op.add_column("user_preferences", sa.Column("last_briefing_date", sa.String(10), nullable=True))

    # 2. Ensure all strategies have bt_discount = 1 (may already be done by a5c3f3c810ae)
    conn.execute(sa.text("UPDATE strategies SET bt_discount = 1.0"))

    # 3. Clear bayes caches to force recomputation with new bt_discount
    try:
        dialect = conn.dialect.name
        if dialect == "postgresql":
            conn.execute(sa.text(
                "UPDATE strategies "
                "SET metrics_snapshot = (metrics_snapshot::jsonb - 'bayes_cache')::json "
                "WHERE metrics_snapshot IS NOT NULL "
                "AND metrics_snapshot::text LIKE '%bayes_cache%'"
            ))
        elif dialect == "sqlite":
            conn.execute(sa.text(
                "UPDATE strategies "
                "SET metrics_snapshot = json_remove(metrics_snapshot, '$.bayes_cache') "
                "WHERE metrics_snapshot IS NOT NULL"
            ))
    except Exception:
        pass  # Cache will be stale but will eventually refresh


def downgrade() -> None:
    op.drop_column("user_preferences", "last_briefing_date")
    op.drop_column("user_preferences", "briefing_hour_utc")
