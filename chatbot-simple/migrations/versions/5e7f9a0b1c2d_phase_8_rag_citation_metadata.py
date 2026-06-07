"""phase 8 rag citation metadata

Revision ID: 5e7f9a0b1c2d
Revises: 4d6e8f9a0b1c
Create Date: 2026-06-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "5e7f9a0b1c2d"
down_revision: Union[str, None] = "4d6e8f9a0b1c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("document_chunks", sa.Column("section_title", sa.String(length=240), nullable=True))
    op.add_column("document_chunks", sa.Column("start_char", sa.Integer(), nullable=True))
    op.add_column("document_chunks", sa.Column("end_char", sa.Integer(), nullable=True))
    op.add_column("document_chunks", sa.Column("source_excerpt", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("document_chunks", "source_excerpt")
    op.drop_column("document_chunks", "end_char")
    op.drop_column("document_chunks", "start_char")
    op.drop_column("document_chunks", "section_title")
