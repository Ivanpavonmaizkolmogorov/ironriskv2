"""fix add briefing columns to user_preferences for PG

The original e74db5cda078 migration had 'pass' when it was first deployed,
so Alembic marked it as done without actually creating the columns.
This migration fixes that by adding them if missing.

Also re-runs the bt_discount=1 update and bayes cache invalidation
in case those also failed in the chain.

Revision ID: ec5182343cb4
"""
from alembic import op
import sqlalchemy as sa

revision = 'ec5182343cb4'
down_revision = '51390179ad16'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = [c["name"] for c in inspector.get_columns("user_preferences")]
    
    # 1. Add missing columns
    if "briefing_hour_utc" not in existing:
        op.add_column("user_preferences", sa.Column("briefing_hour_utc", sa.Integer(), nullable=False, server_default="6"))
    if "last_briefing_date" not in existing:
        op.add_column("user_preferences", sa.Column("last_briefing_date", sa.String(10), nullable=True))

    # 2. Set all strategies bt_discount to 1
    conn.execute(sa.text("UPDATE strategies SET bt_discount = 1.0"))

    # 3. Invalidate bayes caches
    dialect = conn.dialect.name
    if dialect == "postgresql":
        conn.execute(sa.text(
            "UPDATE strategies "
            "SET metrics_snapshot = metrics_snapshot - 'bayes_cache' "
            "WHERE metrics_snapshot IS NOT NULL "
            "AND metrics_snapshot::text LIKE :pattern"
        ), {"pattern": "%bayes_cache%"})
    elif dialect == "sqlite":
        conn.execute(sa.text(
            "UPDATE strategies "
            "SET metrics_snapshot = json_remove(metrics_snapshot, '$.bayes_cache') "
            "WHERE metrics_snapshot IS NOT NULL"
        ))


def downgrade() -> None:
    pass
