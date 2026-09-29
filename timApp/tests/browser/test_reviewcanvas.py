import io

from timApp.answer.answers import save_answer
from timApp.auth.accesstype import AccessType
from timApp.item.block import Block
from timApp.plugin.taskid import TaskId
from timApp.tests.browser.browsertest import (
    BrowserTest,
)
from timApp.timdb.sqa import db
from timApp.upload.uploadedfile import PluginUpload


class ReviewcanvasTest(BrowserTest):
    def test_get_multiple_uploads_rights(self):
        # TODO: reviewcanvas / tableform answering fails when posting answers via server tests
        self.login_test1()
        d = self.create_doc(
            initial_par="""
``` {#rc plugin="reviewcanvas"}
```
                    """
        )
        file = open("tests/a.png", "rb")
        file_content = file.read()
        file.close()
        ur = self.post(
            f"/pluginUpload/{d.id}/rc/",
            data={"file": (io.BytesIO(file_content), "a.png")},
            expect_status=200,
        )
        mimetype = "image/png"
        file_path = ur[0]["file"]
        user_input = {
            "uploadedFiles": [
                {
                    "path": file_path,
                    "rotation": 0,
                    "type": mimetype,
                }
            ]
        }
        self.post_answer("reviewcanvas", f"{d.id}.rc", user_input)
        d2 = self.create_doc(
            initial_par="""
``` {#rc2 plugin="reviewcanvas"}
```
                            """
        )
        self.test_user_2.grant_access(d2, AccessType.view)
        db.session.commit()
        db.session.refresh(db.session.get(Block, d2.block.id))
        self.login_test2()
        # Fail, upload is not testuser2's
        self.post_answer("reviewcanvas", f"{d2.id}.rc2", user_input, expect_status=403)
        # Skip answer route and make custom answer with alternative methods
        answer = save_answer(
            [self.test_user_2],
            TaskId.parse(f"{d2.id}.rc2"),
            content=user_input,
            points=0,
        )
        db.session.commit()
        pdfurl = f"/reviewcanvaspdf/{self.test_user_2.name}_{d2.id}_rc2_{answer.id}.pdf"
        # Fail again, upload access rights are checked from original answer
        self.get(pdfurl, expect_status=403)
        self.test_user_2.grant_access(d, AccessType.teacher)
        db.session.commit()
        db.session.refresh(db.session.get(Block, d.block.id))
        self.get(pdfurl, expect_status=200)

    def test_corrupt_image(self):
        self.login_test1()
        d = self.create_doc(
            initial_par="""
``` {#rc plugin="reviewcanvas"}
```
                            """
        )
        ur = self.post(
            f"/pluginUpload/{d.id}/rc/",
            data={"file": (io.BytesIO(b"GIF87a"), "a.jpeg")},
            expect_status=400,
        )

    def test_deleted_upload(self):
        """The state of an answer is loaded even if its upload has been deleted."""
        self.login_test1()
        d = self.create_doc(
            initial_par="""
``` {#rc plugin="reviewcanvas"}
```
                            """
        )
        with open("tests/a.png", "rb") as file:
            file_content = file.read()
        ur = self.post(
            f"/pluginUpload/{d.id}/rc/",
            data={"file": (io.BytesIO(file_content), "a.png")},
            expect_status=200,
        )
        user_input = {
            "uploadedFiles": [
                {"path": ur[0]["file"], "rotation": 0, "type": "image/png"}
            ]
        }
        resp = self.post_answer("reviewcanvas", f"{d.id}.rc", user_input)
        self.assertTrue(
            PluginUpload(db.session.get(Block, ur[0]["block"])).delete_file()
        )
        db.session.commit()
        r = self.get(
            "/getState",
            query_string={
                "user_id": self.current_user_id(),
                "answer_id": resp["savedNew"],
                "par_id": d.document.get_paragraphs()[0].get_id(),
                "doc_id": d.id,
            },
        )
        self.assertIn("<reviewcanvas-runner", r["html"])
        self.assertNotIn("pluginError", r["html"])
        self.get(ur[0]["file"], expect_status=410)
