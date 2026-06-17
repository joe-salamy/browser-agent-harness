#!/usr/bin/env python3
"""Focused tests for worktree-flow and save-plan workflow helpers."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPTS_DIR = Path(__file__).resolve().parent


def load_script_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS_DIR / filename)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


worktree_flow = load_script_module("worktree_flow_under_test", "worktree-flow.py")
save_plan = load_script_module("save_plan_under_test", "save-plan.py")


class CommandRunnerOutputTests(unittest.TestCase):
    def test_quiet_mode_captures_stdout_without_command_trace(self) -> None:
        runner = worktree_flow.CommandRunner(verbose=False)
        stdout = io.StringIO()

        with contextlib.redirect_stdout(stdout):
            result = runner.run([sys.executable, "-c", "print('ok')"], Path.cwd())

        self.assertNotIn("+ (", stdout.getvalue())
        self.assertEqual(result.stdout, "ok\n")

    def test_verbose_mode_prints_command_trace(self) -> None:
        runner = worktree_flow.CommandRunner(verbose=True)
        stdout = io.StringIO()

        with contextlib.redirect_stdout(stdout):
            result = runner.run([sys.executable, "-c", "print('ok')"], Path.cwd())

        self.assertTrue(stdout.getvalue().startswith("+ ("))
        self.assertEqual(result.stdout, "ok\n")

    def test_dry_run_prints_command_trace_without_execution(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            marker = Path(temp_dir) / "executed.txt"
            runner = worktree_flow.CommandRunner(dry_run=True, verbose=False)
            stdout = io.StringIO()

            with contextlib.redirect_stdout(stdout):
                result = runner.run(
                    [
                        sys.executable,
                        "-c",
                        f"from pathlib import Path; Path({str(marker)!r}).write_text('ran')",
                    ],
                    Path.cwd(),
                )

            self.assertTrue(stdout.getvalue().startswith("+ ("))
            self.assertFalse(marker.exists())
            self.assertEqual(result.returncode, 0)


class SavePlanWarningTests(unittest.TestCase):
    def test_generic_title_warning(self) -> None:
        stderr = io.StringIO()

        with contextlib.redirect_stderr(stderr):
            save_plan.warn_if_generic_plan_title("Context")

        self.assertEqual(
            stderr.getvalue(),
            'Warning: plan H1 "Context" is generic; use a descriptive H1 because worktree-flow uses it for branch names, archive folders, and commit messages.\n',
        )

    def test_descriptive_title_has_no_warning(self) -> None:
        stderr = io.StringIO()

        with contextlib.redirect_stderr(stderr):
            save_plan.warn_if_generic_plan_title("Web Search Grounding")

        self.assertEqual(stderr.getvalue(), "")


class WorktreeArtifactTests(unittest.TestCase):
    def make_flow(self, repo: Path):
        config = worktree_flow.FlowConfig(
            repo=repo,
            plan=repo / "plan.md",
            base="main",
            model=None,
            harness="omp",
            harness_dir=Path(".omp"),
            merge_mode="squash",
            keep_worktrees=False,
            verbose=False,
        )
        return worktree_flow.HarnessWorktreeFlow(
            config, worktree_flow.CommandRunner(verbose=False)
        )

    def test_audit_prompt_requires_loading_relevant_skills(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo = Path(temp_dir) / "repo"
            worktree = Path(temp_dir) / "worktree"
            flow = self.make_flow(repo)

            prompt = flow.audit_prompt(worktree, repo / "plan.md", post_conflict=False)

            self.assertIn("Use the audit-worktree skill.", prompt)
            self.assertIn(
                "Load every skill that is relevant to the diff, plan, implementation summary",
                prompt,
            )

    def test_archive_handoff_copies_plan_md(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            repo = root / "repo"
            worktree = root / "worktree"
            handoff = worktree / ".omp" / "handoff"
            handoff.mkdir(parents=True)
            (handoff / "implementation-summary.md").write_text(
                "summary\n", encoding="utf-8"
            )
            plan_path = root / "plan.md"
            plan_path.write_text("# Web Search Grounding\n", encoding="utf-8")

            flow = self.make_flow(repo)
            archive = flow.archive_handoff(
                repo, worktree, "web-search-20260616-010203", plan_path
            )

            self.assertEqual(
                (archive / "implementation-summary.md").read_text(encoding="utf-8"),
                "summary\n",
            )
            self.assertEqual(
                (archive / "plan.md").read_text(encoding="utf-8"),
                "# Web Search Grounding\n",
            )

    def test_remove_primary_plan_input_removes_only_transient_plan(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo = Path(temp_dir) / "repo"
            flow = self.make_flow(repo)
            transient = repo / ".omp" / "worktree-flow" / "web-search"
            transient.mkdir(parents=True)
            (transient / "plan.md").write_text("# Web Search Grounding\n", encoding="utf-8")

            flow.remove_primary_plan_input(repo, "web-search")

            self.assertFalse(transient.exists())

            non_empty = repo / ".omp" / "worktree-flow" / "web-search-extra"
            non_empty.mkdir(parents=True)
            (non_empty / "plan.md").write_text("# Web Search Grounding\n", encoding="utf-8")
            (non_empty / "keep.txt").write_text("keep\n", encoding="utf-8")
            stderr = io.StringIO()

            with contextlib.redirect_stderr(stderr):
                flow.remove_primary_plan_input(repo, "web-search-extra")

            self.assertFalse((non_empty / "plan.md").exists())
            self.assertEqual((non_empty / "keep.txt").read_text(encoding="utf-8"), "keep\n")
            self.assertIn(
                "Warning: left non-empty workflow plan directory:", stderr.getvalue()
            )


if __name__ == "__main__":
    unittest.main()
