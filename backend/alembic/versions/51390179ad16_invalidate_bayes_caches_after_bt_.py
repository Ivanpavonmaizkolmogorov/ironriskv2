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
    # Handled by ec5182343cb4 catch-all migration
    pass


def downgrade() -> None:
    pass
