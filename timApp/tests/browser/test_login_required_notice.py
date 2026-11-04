"""Browser tests for the "log in to answer" notice shown above a task to users who are not logged in."""
from selenium.webdriver import ActionChains
from selenium.webdriver.common.by import By

from timApp.auth.accesstype import AccessType
from timApp.tests.browser.browsertest import BrowserTest
from timApp.user.usergroup import UserGroup

PALI_TASK = """
#- {plugin=pali #t}
needed_len: 5
"""

CS_TASK = """
``` {plugin=csPlugin #cs1}
type: text
byCode: hello
"""


class LoginRequiredNoticeTest(BrowserTest):
    def create_public_doc(self, initial_par: str):
        self.login_test1()
        d = self.create_doc(initial_par=initial_par)
        d.block.add_rights([UserGroup.get_anonymous_group()], AccessType.view)
        self.commit_db()
        return d

    def test_anonymous_user_sees_banner_and_lock_that_opens_login_dialog(self):
        d = self.create_public_doc(PALI_TASK)
        # The browser has not logged in.
        self.drv.delete_all_cookies()
        self.goto_document(d)
        banners = self.drv.find_elements(By.CSS_SELECTOR, ".login-required-banner")
        self.assertEqual(1, len(banners))
        self.assertIn("You can read the material", banners[0].text)
        login = self.find_element_avoid_staleness(
            "tim-plugin-loader .login-required-lock .login-required-login"
        )
        self.assertIn("Log in to answer", login.text)
        login.click()
        self.wait_until_present_and_vis("tim-login-dialog")

    def test_banner_can_be_closed(self):
        d = self.create_public_doc(CS_TASK)
        self.drv.delete_all_cookies()
        self.goto_document(d)
        banner = self.find_element_avoid_staleness(".login-required-banner")
        self.assertGreater(banner.size["height"], 0)
        card_top_before = self.drv.execute_script(
            "return getComputedStyle(document.querySelector("
            "'tim-plugin-loader .login-required-overlay .login-required-card')).top"
        )
        # The locked task's sticky card keeps clear of the sticky banner.
        self.assertGreater(float(card_top_before.rstrip("px")), banner.size["height"])
        banner.find_element(By.CSS_SELECTOR, ".login-required-banner-close").click()
        self.should_not_exist(".login-required-banner")
        card_top_after = self.drv.execute_script(
            "return getComputedStyle(document.querySelector("
            "'tim-plugin-loader .login-required-overlay .login-required-card')).top"
        )
        self.assertLess(
            float(card_top_after.rstrip("px")), float(card_top_before.rstrip("px"))
        )
        # The task stays locked; only the notice is gone.
        self.find_element_avoid_staleness("tim-plugin-loader .login-required-lock")

    def test_logged_in_user_sees_no_banner_or_lock(self):
        d = self.create_public_doc(PALI_TASK)
        self.login_browser_quick_test1()
        self.goto_document(d)
        self.find_element_avoid_staleness("tim-plugin-loader pali-runner")
        self.should_not_exist(".login-required-banner")
        self.should_not_exist(".login-required-lock")

    def test_anonymous_allowed_task_shows_no_banner_or_lock(self):
        d = self.create_public_doc(PALI_TASK + "anonymous: true\n")
        self.drv.delete_all_cookies()
        self.goto_document(d)
        self.find_element_avoid_staleness("tim-plugin-loader pali-runner")
        self.should_not_exist(".login-required-banner")
        self.should_not_exist(".login-required-lock")

    def test_anonymous_user_cannot_activate_veiled_lazy_plugin(self):
        d = self.create_public_doc(CS_TASK + "lazy: true\n```\n")
        loader_sel = f'tim-plugin-loader[task-id="{d.id}.cs1"]'
        self.drv.delete_all_cookies()
        self.goto_document(d)
        self.find_element_avoid_staleness(f"{loader_sel} .csLazyPre")
        # Hovering and clicking would normally load the real plugin.
        loader = self.find_element_avoid_staleness(loader_sel)
        ActionChains(self.drv).move_to_element(loader).click().perform()
        self.should_not_exist(f"{loader_sel} cs-runner")
        self.find_element_avoid_staleness(f"{loader_sel} .csLazyPre")
        # "Show anyway" loads the real plugin, as hovering does for logged-in users.
        self.find_element(f"{loader_sel} .login-required-show").click()
        self.find_element_avoid_staleness(f"{loader_sel} cs-runner")

    def test_anonymous_user_gets_veiled_non_lazy_plugin(self):
        d = self.create_public_doc(CS_TASK + "lazy: false\n```\n")
        loader_sel = f'tim-plugin-loader[task-id="{d.id}.cs1"]'
        self.drv.delete_all_cookies()
        self.goto_document(d)
        # The real plugin is rendered behind the veil...
        self.find_element_avoid_staleness(f"{loader_sel} cs-runner")
        # ...and is inert while covered, so that it cannot be reached by keyboard.
        self.find_element(f"{loader_sel} > div[inert]")

    def test_logged_in_user_can_activate_lazy_plugin(self):
        d = self.create_public_doc(CS_TASK + "lazy: true\n```\n")
        loader_sel = f'tim-plugin-loader[task-id="{d.id}.cs1"]'
        self.login_browser_quick_test1()
        self.goto_document(d)
        # Wait until the paragraph has been compiled before hovering; the DOM is replaced on load.
        self.find_element_avoid_staleness(f"{loader_sel} .csLazyPre")
        self.find_element_and_move_to(loader_sel)
        self.find_element_avoid_staleness(f"{loader_sel} cs-runner")
        self.should_not_exist(f"{loader_sel} > div[inert]")

    def test_inline_fields_get_veil_with_lock_badge(self):
        d = self.create_public_doc(
            """
#- {defaultplugin="textfield"}
Fields: {#a cols: 3#} and {#b cols: 40#}
"""
        )
        doc_id = d.id
        self.drv.delete_all_cookies()
        self.goto_document(d)
        for name in ("a", "b"):
            sel = f'tim-plugin-loader[task-id="{doc_id}.{name}"]'
            # The real plugin is rendered, not a static copy; it is inert behind the veil.
            self.find_element_avoid_staleness(
                f"{sel} > span[inert] tim-textfield-runner input"
            )
            # The lock badge is a real button on the veil that covers the field.
            self.find_element(
                f"{sel} .login-required-overlay.inline button.login-required-lock.inline"
            )
        # The label of the lock is shown only when the field is wide enough for it.
        label_sel = ".login-required-overlay.inline .login-required-lock-label"
        self.wait_until_hidden(f'tim-plugin-loader[task-id="{doc_id}.a"] {label_sel}')
        self.assertTrue(
            self.find_element(
                f'tim-plugin-loader[task-id="{doc_id}.b"] {label_sel}'
            ).is_displayed()
        )
        self.assertEqual(
            1, len(self.drv.find_elements(By.CSS_SELECTOR, ".login-required-banner"))
        )

    def test_show_anyway_removes_veil_and_makes_plugin_usable(self):
        d = self.create_public_doc(CS_TASK + "lazy: false\n```\n")
        loader_sel = f'tim-plugin-loader[task-id="{d.id}.cs1"]'
        self.drv.delete_all_cookies()
        self.goto_document(d)
        self.find_element_avoid_staleness(f"{loader_sel} cs-runner")
        # The task is covered by a veil with a card that offers login and "Show anyway".
        self.find_element(f"{loader_sel} .login-required-overlay .login-required-lock")
        self.find_element(
            f"{loader_sel} .login-required-overlay .login-required-show"
        ).click()
        self.should_not_exist(f"{loader_sel} .login-required-overlay")
        # The plugin is now an ordinary plugin (not inert, buttons shown), and login is still offered.
        self.should_not_exist(f"{loader_sel} > div[inert]")
        self.find_element(f"{loader_sel} .login-required-lock")
        buttons = self.drv.find_elements(By.CSS_SELECTOR, f"{loader_sel} .timButton")
        self.assertTrue(buttons)
        for b in buttons:
            self.assertTrue(b.is_displayed())
