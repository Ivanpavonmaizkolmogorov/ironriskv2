"""set all strategies bt_discount to 1

Revision ID: a5c3f3c810ae
"""
from alembic import op
import sqlalchemy as sa

revision = 'a5c3f3c810ae'
down_revision = 'e74db5cda078'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Handled by ec5182343cb4 catch-all migration
    pass


def downgrade() -> None:
    pass
