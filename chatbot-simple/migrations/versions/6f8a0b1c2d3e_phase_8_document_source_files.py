"""phase 8 document source files

Revision ID: 6f8a0b1c2d3e
Revises: 5e7f9a0b1c2d
Create Date: 2026-06-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6f8a0b1c2d3e"
down_revision: Union[str, None] = "5e7f9a0b1c2d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("storage_path", sa.Text(), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("documents", "storage_path")
