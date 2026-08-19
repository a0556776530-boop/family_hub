from __future__ import annotations
import re
from agent.skills.base import ToolResult
from agent.registry import REGISTRY, get_skill_for_tool


class Executor:
    """Runs a single PlanStep, resolving parameter dependencies from ExecutionContext."""

    def run(self, step, context, user: dict) -> ToolResult:
        from agent.skills import get_skill

        tool_name  = step.tool
        skill_name = get_skill_for_tool(tool_name)

        if skill_name not in ('Shopping', 'Tasks', 'Calendar', 'Search', 'Family', 'Reminders'):
            return ToolResult.fail(f'No skill found for tool {tool_name!r}')

        try:
            skill  = get_skill(skill_name)
            params = self._resolve_deps(step.params, context)

            # Inject role_override into params if permission gate set one
            if hasattr(step, 'role_override') and step.role_override:
                params = {**params, **step.role_override}

            return skill.execute(tool_name, params, user, context)
        except Exception as e:
            import sys
            print(f'[executor] {tool_name}: {e!r}', file=sys.stderr)
            return ToolResult.fail(f'שגיאה בביצוע {tool_name}: {str(e)[:100]}')

    def _resolve_deps(self, params: dict, context) -> dict:
        """Replace $steps[N].field references with actual values from context."""
        if not params:
            return {}
        resolved = {}
        for k, v in params.items():
            if isinstance(v, str) and v.startswith('$steps['):
                resolved[k] = context.resolve_dep(v)
            elif isinstance(v, list):
                resolved[k] = [
                    context.resolve_dep(item) if isinstance(item, str) and item.startswith('$steps[') else item
                    for item in v
                ]
            elif isinstance(v, dict):
                resolved[k] = self._resolve_deps(v, context)
            else:
                resolved[k] = v
        return resolved
