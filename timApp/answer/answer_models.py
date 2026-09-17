from typing import TYPE_CHECKING, Optional

from sqlalchemy import UniqueConstraint, ForeignKey
from sqlalchemy.orm import mapped_column, Mapped, relationship

from timApp.timdb.sqa import db
from timApp.timdb.types import datetime_tz

if TYPE_CHECKING:
    from timApp.item.block import Block
    from timApp.answer.answer import Answer


class AnswerTag(db.Model):
    """Tags for an Answer.

    TODO: Answer should be a Block and the tags would then come from the tag table.
    """

    id: Mapped[int] = mapped_column(primary_key=True)
    answer_id: Mapped[int] = mapped_column(ForeignKey("answer.id"))
    tag: Mapped[str]


class AnswerUpload(db.Model):
    """Associates uploaded files (Block with type BlockType.AnswerUpload) with Answers."""

    upload_block_id: Mapped[int] = mapped_column(
        ForeignKey("block.id"), primary_key=True
    )
    answer_id: Mapped[Optional[int]] = mapped_column(ForeignKey("answer.id"))
    deleted_at: Mapped[Optional[datetime_tz]]
    """When the uploaded file was deleted from the disk. None if the file has not been deleted."""
    delete_after: Mapped[Optional[datetime_tz]] = mapped_column(index=True)
    """When the uploaded file can be deleted automatically. None if the file is kept indefinitely."""

    block: Mapped["Block"] = relationship(back_populates="answerupload")
    answer: Mapped[Optional["Answer"]] = relationship(back_populates="uploads")

    def __init__(self, block, answer=None):
        self.block = block
        self.answer = answer


class UserAnswer(db.Model):
    """Associates Users with Answers."""

    id: Mapped[int] = mapped_column(primary_key=True)
    answer_id: Mapped[int] = mapped_column(ForeignKey("answer.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("useraccount.id"))

    __table_args__ = (UniqueConstraint("answer_id", "user_id"),)
