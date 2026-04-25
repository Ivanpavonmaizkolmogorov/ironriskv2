"""drop bt_discount column from strategies

Revision ID: g002_drop_bt_discount
Revises: f001_consolidated
"""
from alembic import op
import sqlalchemy as sa

revision = 'g002_drop_bt_discount'
down_revision = 'f001_consolidated'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = [c["name"] for c in inspector.get_columns("strategies")]
    if "bt_discount" in existing:
        op.drop_column("strategies", "bt_discount")


def downgrade() -> None:
    op.add_column("strategies", sa.Column("bt_discount", sa.Float(), nullable=False, server_default="1.0"))
