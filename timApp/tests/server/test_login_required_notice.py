"""Tests for the "log in to answer" notice that TIM shows above a task to users who are not logged in.

TIM marks the plugin loader with ``login-required="true"`` when the viewer is not logged in and the
plugin markup does not allow anonymous answers (``anonymous: true``). The client shows the notice
based on that attribute, so the plugins themselves no longer need to ask the user to log in.
"""
from timApp.auth.accesstype import AccessType
from timApp.tests.server.timroutetest import TimRouteTest
from timApp.user.usergroup import UserGroup


class LoginRequiredNoticeTest(TimRouteTest):
    def create_public_doc(self, initial_par: str) -> str:
        """Creates a document that anonymous users can view and returns its URL."""
        self.login_test1()
        d = self.create_doc(initial_par=initial_par)
        d.block.add_rights([UserGroup.get_anonymous_group()], AccessType.view)
        self.commit_db()
        return d.url

    def get_loader(self, url: str):
        tree = self.get(url, as_tree=True)
        loaders = tree.cssselect("tim-plugin-loader")
        self.assertEqual(1, len(loaders))
        return loaders[0]

    def test_anonymous_user_gets_login_required_mark(self):
        url = self.create_public_doc(
            """
#- {plugin=pali #t}
needed_len: 5
"""
        )
        self.logout()
        self.assertEqual("true", self.get_loader(url).get("login-required"))

    def test_logged_in_user_gets_no_login_required_mark(self):
        url = self.create_public_doc(
            """
#- {plugin=pali #t}
needed_len: 5
"""
        )
        self.assertIsNone(self.get_loader(url).get("login-required"))

    def test_anonymous_allowed_plugin_gets_no_login_required_mark(self):
        url = self.create_public_doc(
            """
#- {plugin=pali #t}
needed_len: 5
anonymous: true
"""
        )
        self.logout()
        self.assertIsNone(self.get_loader(url).get("login-required"))

    def test_plugin_without_task_gets_no_login_required_mark(self):
        url = self.create_public_doc(
            """
``` {plugin=graphviz}
lazy: true
```
"""
        )
        self.logout()
        self.assertIsNone(self.get_loader(url).get("login-required"))

    def test_non_answerable_plugin_gets_no_login_required_mark(self):
        """A plugin that has a task id but no answer route (e.g. showVideo) stays usable without logging in."""
        url = self.create_public_doc(
            """
``` {plugin=showVideo #vid}
file: https://example.com/video.mp4
```
"""
        )
        self.logout()
        self.assertIsNone(self.get_loader(url).get("login-required"))

    def test_answerable_plugin_without_answer_browser_gets_login_required_mark(self):
        """Plugins without an answer browser (e.g. multisave) still save answers, so they are locked."""
        url = self.create_public_doc(
            """
``` {plugin=multisave #ms}
```
"""
        )
        self.logout()
        self.assertEqual("true", self.get_loader(url).get("login-required"))

    def test_plugin_server_does_not_repeat_the_login_request(self):
        url = self.create_public_doc(
            """
#- {plugin=pali #t}
needed_len: 5
"""
        )
        self.logout()
        html = self.get(url)
        self.assertNotIn("to interact with this component", html)

    def test_csplugin_does_not_repeat_the_login_request(self):
        url = self.create_public_doc(
            """
``` {plugin=csPlugin #t}
type: text
```
"""
        )
        self.logout()
        html = self.get(url)
        self.assertNotIn("to interact with this component", html)
        self.assertEqual("true", self.get_loader(url).get("login-required"))

    def test_plugin_server_renders_the_real_plugin_for_anonymous_users(self):
        """The plugin server no longer renders a static version for users who are not logged in;
        TIM locks the real plugin instead."""
        url = self.create_public_doc(
            """
#- {plugin=pali #t}
needed_len: 5
"""
        )
        self.logout()
        loader = self.get_loader(url)
        self.assertEqual("true", loader.get("login-required"))
        self.assertEqual(1, len(loader.cssselect("pali-runner[json]")))
        self.assertFalse(loader.cssselect("button.timButton"))
