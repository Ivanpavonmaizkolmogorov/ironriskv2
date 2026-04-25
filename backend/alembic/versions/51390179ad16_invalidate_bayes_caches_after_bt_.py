"""invalidate bayes caches after bt_discount change

Revision ID: 51390179ad16
"""
from alembic import op
import sqlalchemy as sa

revision = '51390179ad16'
down_revision = 'a5c3f3c810ae'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name
    if dialect == "postgresql":
        # Use sa.text() to avoid '?' being parsed as a parameter placeholder
        conn.execute(sa.text(
            "UPDATE strategies "
            "SET metrics_snapshot = metrics_snapshot - 'bayes_cache' "
            "WHERE metrics_snapshot IS NOT NULL "
            "AND metrics_snapshot ?? 'bayes_cache'"
        ))
    elif dialect == "sqlite":
        conn.execute(sa.text(
            "UPDATE strategies "
            "SET metrics_snapshot = json_remove(metrics_snapshot, '$.bayes_cache') "
            "WHERE metrics_snapshot IS NOT NULL"
        ))


def downgrade() -> None:
    pass  # Cache will auto-rebuild
