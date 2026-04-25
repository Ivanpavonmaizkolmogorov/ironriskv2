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
    op.execute("UPDATE strategies SET bt_discount = 1.0")


def downgrade() -> None:
    op.execute("UPDATE strategies SET bt_discount = 10.0")
