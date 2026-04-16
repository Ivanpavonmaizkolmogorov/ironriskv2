"""Add hostname column to trading_accounts

Revision ID: a1b2c3d4e5f6
Revises: 7fe6706b9b5d
Create Date: 2026-04-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

# revision identifiers
revision = 'a1b2c3d4e5f6'
down_revision = '7fe6706b9b5d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Safe for both SQLite and PostgreSQL: check if column exists before adding
    conn = op.get_bind()
    inspector = sa_inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('trading_accounts')]
    if 'hostname' not in columns:
        op.add_column('trading_accounts', sa.Column('hostname', sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column('trading_accounts', 'hostname')
