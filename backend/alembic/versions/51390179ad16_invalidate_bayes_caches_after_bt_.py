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
    # PostgreSQL: remove 'bayes_cache' key from JSONB metrics_snapshot
    # This forces recomputation on next dashboard load
    conn = op.get_bind()
    dialect = conn.dialect.name
    if dialect == "postgresql":
        op.execute("""
            UPDATE strategies 
            SET metrics_snapshot = metrics_snapshot - 'bayes_cache'
            WHERE metrics_snapshot IS NOT NULL 
              AND metrics_snapshot ? 'bayes_cache'
        """)
    elif dialect == "sqlite":
        op.execute("""
            UPDATE strategies 
            SET metrics_snapshot = json_remove(metrics_snapshot, '$.bayes_cache')
            WHERE metrics_snapshot IS NOT NULL
        """)


def downgrade() -> None:
    pass  # Cache will auto-rebuild
